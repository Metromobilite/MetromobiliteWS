// *
// Metromobilité is the mobile application of Grenoble Alpes Métropole <http://www.metromobilite.fr/>.
// It provides all the information and services for your travels in Grenoble agglomeration.

// Copyright (C) 2013
// Contributors:
//	NB/VT - sully-group - www.sully-group.fr - initialisation and implementation

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.
// *

// module de demande d'horaires à otp
// fiches horaires theoriques
// 		un fichier pivot est utilisé pour determinier pour chaque ligne/sens un poteau ou toutes les courses passent.
// 		on specifie egalement le delai maximum en secondes entre le debut de la course et le passage a ce poteau.
// prochains passages au poteau ou a une zone d'arret
// les données temps reel peuvent soit etre dans OTP directement soit etre integrées dans des modules additionels specifiques a chaque prestataire(reseau de urbain et departement par exemple)
// on peut etablir des associations entre les poteaux des reseaux primaires et secondaires(reseau de urbain et departement par exemple) quand ils sont physiquement les mêmes
const Joi = require('koa-joi-router').Joi;
var axios = require('axios');
var querystring = require('querystring');
var fs = require('fs');

var main = require('./index');

var urlOtp;
global.otp = {
	stops:{},
	idStops:{},
	parentStations:{},
	idParentStations:{},
	clusters:{},
	routes:{},
	idRoutes:{},
	routesPatterns:{}
};

global.pivots={};
global.etatsServeurs = {OTP:false,lastFailOTP:false,realTimeOTP:{}};
global.liaisonsServeurs = {};
global.etatGtfsRt = {routes:{}};
global.refStopsLinks={"type": "FeatureCollection", "features": [], objects:{}};
global.parentStationsFromPoint = {};
const NOT_INITIALIZED = 'NOT_INITIALIZED';
exports.NOT_INITIALIZED = NOT_INITIALIZED;
const OK = 'OK';
exports.OK = OK;
const CONNECTION_LOST = 'CONNECTION_LOST';
exports.CONNECTION_LOST = CONNECTION_LOST;

var nbTripsStatique;
var numberOfDepartures;
var dependencies = {};
var primaryAgency;
var secondaryAgency;

exports.routes = [
	{
		method: 'get',
		path: '/api/serverStatus/json',
		handler: getEtatsServeurs,
		meta:{
			description:'Etat courant des horaires temps réel.'
		},
		groupName: 'Temps réel',
		cors:true,
		private:true
	},
	{
		method: 'get',
		path: '/api/gtfsRtStatus/json',
		handler: getGtfsRtStatus,
		meta:{
			description:'Etat du GTFS-RT.'
		},
		groupName: 'Temps réel',
		cors:true,
		private:true
	},
	{
		method: 'get',
		path: '/api/routers/:router/index/routes',
		handler: getRoutes,
		meta:{
			description:'Lignes de transport en commun par reseau ou par codes.'
		},
		groupName: 'Référentiel',
		cors:true,
		validate:{
			params:{
				router:Joi.string().valid('default')
			},
			query:{
				reseaux:Joi.string(),
				codes:Joi.string()
			}
		}
	},
	{
		method: 'get',
		path: '/api/routers/:router/index/routes/:id/clusters',
		handler: routeClusters,
		meta:{
			description:'Les zones d\'arret d\'une lignes de transport en commun.'
		},
		groupName: 'Référentiel',
		cors:true,
		validate:{
			params:{
				router:Joi.string().valid('default'),
				id:Joi.string()
			}
		}
	},
	{
		method: 'get',
		path: '/api/routers/:router/index/routes/:id/stops',
		handler: routeStops,
		meta:{
			description:'Les poteaux d\'une lignes de transport en commun.'
		},
		groupName: 'Référentiel',
		cors:true,
		validate:{
			params:{
				router:Joi.string().valid('default'),
				id:Joi.string()
			}
		}
	},
	{
		method: 'get',
		path: '/api/routers/:router/index/stops/:id/stoptimes/:date',
		handler: stoptimesDate,
		meta:{
			description:'Les horaires de passage a un poteau a une date donnée.'
		},
		groupName: 'Référentiel',
		cors:true,
		validate:{
			params:{
				router:Joi.string().valid('default'),
				id:Joi.string(),
				date:Joi.string()
			}
		}
	},
	{
		method: 'get',
		path: '/api/routers/:router/index/stops/:id/patterns',
		handler: stopsPatterns,
		meta:{
			description:'Les differents parcours qui passent a un poteau.'
		},
		groupName: 'Référentiel',
		cors:true,
		validate:{
			params:{
				router:Joi.string().valid('default'),
				id:Joi.string()
			}
		}
	},
	{
		method: 'get',
		path: '/api/routers/:router/index/stops/:id/routes',
		handler: stopRoutes,
		meta:{
			description:'Les differentes Lignes qui passent a un poteau.'
		},
		groupName: 'Référentiel',
		cors:true,
		validate:{
			params:{
				router:Joi.string().valid('default'),
				id:Joi.string()
			}
		}
	},
	{
		method: 'get',
		path: '/api/ficheHoraires/json',
		handler: ficheHoraires,
		meta:{
			description:'La fiche horaire d\'une ligne de transport en commun.'
		},
		groupName: 'Référentiel',
		cors:true
	},
	{
		method: 'get',
		path: '/api/routers/:router/index/stops/:id/stoptimes',
		handler: stopStoptimes,
		meta:{
			description:'Les prochains horaires de passage à un poteau.'
		},
		groupName: 'Temps réel',
		cors:true
	},
	{
		method: 'get',
		path: '/api/routers/:router/index/clusters/:id/stoptimes',
		handler: clusterStoptimes,
		meta:{
			description:'Les prochains horaires de passage à une zone d\'arret.'
		},
		groupName: 'Temps réel',
		cors:true
	},
	{
		method: 'get',
		path: '/api/routers/:router/index/clusters/:id/routes',
		handler: clusterRoutes,
		meta:{
			description:'Les lignes qui passent à une zone d\'arret.'
		},
		groupName: 'Référentiel',
		cors:true
	},
	{
		method: 'get',
		path: '/api/ficheHoraires/pdf',
		handler: ficheHorairesPdf,
		meta:{
			description:'La fiche horaire d\'une ligne de transport en commun au format PDF.'
		},
		groupName: 'Référentiel',
		cors:true
	},

];

exports.init = async function (config) {
	try {
		nbTripsStatique = config.plugins.otpHoraires.nbTripsStatique;
		((typeof(config.plugins.otpHoraires.numberOfDeparturesOtp) != 'undefined')?numberOfDepartures = config.plugins.otpHoraires.numberOfDeparturesOtp:numberOfDepartures=2)//valeur otp par defaut
		loadPivots(config);
		buildParentStationsFromPoint(config);
		urlOtp = config.plugins.otpHoraires.url;
		//await exports.testOTP();
		
		global.liaisonsServeurs['OTP'] = { libelle:'OpenTripPlanner', lifecycle:NOT_INITIALIZED };
		for(var d in config.plugins.otpHoraires.dependencies) {
			var file = require('./' + d);
			dependencies[config.plugins.otpHoraires.dependencies[d].agency] = file;
			//if(config.plugins.otpHoraires.dependencies[d].agency)
			//	global.liaisonsServeurs[config.plugins.otpHoraires.dependencies[d].agency] = { libelle:'Cityway '+config.plugins.otpHoraires.dependencies[d].agency, lifecycle:NOT_INITIALIZED };
			//if(!!file.getStatique) await file.getStatique();
			if(!!file.init) await file.init(config);
		}


		if(config.plugins.otpHoraires.stopLinks && config.plugins.otpHoraires.stopLinks.file) {
			var file = config.plugins.otpHoraires.stopLinks.file;
			primaryAgency = config.plugins.otpHoraires.stopLinks.primaryAgency;
			secondaryAgency = config.plugins.otpHoraires.stopLinks.secondaryAgency;
			var data = fs.readFileSync(config.dataPath+file, 'utf8');
			var json = JSON.parse(data);

			global.refStopsLinks.features=global.refStopsLinks.features.concat(json.features);

			json.features.forEach(function (f,index){
				global.refStopsLinks.objects[secondaryAgency+':'+f.properties.secondary_id.toUpperCase()]=primaryAgency+':'+f.properties.primary_id.toUpperCase();
				global.refStopsLinks.objects[primaryAgency+':'+f.properties.primary_id.toUpperCase()]=secondaryAgency+':'+f.properties.secondary_id.toUpperCase();
			});
		}
		//on declare les routes des dependances
		for(var d in dependencies) {
			if (!!dependencies[d].routes) exports.routes = exports.routes.concat(dependencies[d].routes);
		}
	
	} catch (e) {
		main.dumpError(e,'init otpHoraires');
		throw(e);
	}
}
function buildParentStationsFromPoint(config){
	//on constitue des parentStations a partir d'un fichier POI pour avoir des noms de zone d'arret corrects
	if(	!!global.plugins.name['points']
		&& config.types[config.plugins.otpHoraires.typeCluster]
		&& config.plugins.otpHoraires.typeCluster
		&& config.plugins.otpHoraires.codeParentStation
		&& config.plugins.otpHoraires.nameParentStation
		&& !!global.ref[config.plugins.otpHoraires.typeCluster]) {

		for (var i=0;i < global.ref[config.plugins.otpHoraires.typeCluster].features.length;i++) {
			var f = global.ref[config.plugins.otpHoraires.typeCluster].features[i];
			var code = f.properties[config.plugins.otpHoraires.codeParentStation];
			global.parentStationsFromPoint[code.replace('_',':')] =
			{
				code:code.replace('_',':'),
				city:f.properties[config.plugins.otpHoraires.cityParentStation],
				name:f.properties[config.plugins.otpHoraires.nameParentStation],
				lon:f.geometry.coordinates[0],
				lat:f.geometry.coordinates[1]
			};
		}
	}
}



/*exports.testOTP = async function () {
	try{
		if(global.etatsServeurs.lastFailOTP && global.etatsServeurs.lastFailOTP + 60000 > new Date().getTime()) {
			return false;
		}
		var res = await axios({url:urlOtp, timeout: 10000,responseType: 'json',method:'get'});
		if(res.data && res.status== 200) {
			if(global.etatsServeurs.OTP) {
				return true;
			} else {
				await load(main.getConfig());
				return false;
			}
		} else {
			changeEtatServeur('OTP',false);
			console.log('ECHEC de testOTP');
			console.log('Prochaine tentative : '+new Date(global.etatsServeurs.lastFailOTP+60000).toLocaleTimeString());
			return false;
		}
	} catch(e){
		changeEtatServeur('OTP',false);
		console.log('ECHEC de testOTP');
		console.log('Prochaine tentative : '+new Date(global.etatsServeurs.lastFailOTP+60000).toLocaleTimeString());
		return false;
	}
}*/

// * http://data.metromobilite.fr/api/serverStatus/json
async function getEtatsServeurs(ctx){
	try{
		ctx.body = exports.getEtatsServeurs();
	} catch(e){
		main.dumpError(e,'getEtatsServeurs');
	}
}
// http://data.metromobilite.fr/api/routers/default/index/routes/SEM:C/clusters
async function routeClusters(ctx) {
	try {
		var router = ctx.request.params.router;
		var id = ctx.request.params.id;
		ctx.body = global.otp.routesPatterns[id].parentStations;
	} catch(e){
		main.dumpError(e,'otpHoraires.routeClusters');
	}
}
// http://data.metromobilite.fr/api/routers/default/index/routes/SEM:C/stops
async function routeStops(ctx){
	try {
		var router = ctx.request.params.router;
		var id = ctx.request.params.id;

		if(!id || !global.otp.routes[id.toUpperCase()]) {
			ctx.body=[];
			return;
		}
		id=global.otp.routes[id.toUpperCase()].id;
		var options = {url:urlOtp+'/routers/'+router+'/index/routes/'+id+'/stops', timeout: 5000,responseType: 'json',method:'get'};
		if(!options) {
			ctx.body=[];
			return;
		} else {
			if(main.isDebug()) console.log(options.url);

			var res = await axios(options);
			if(res.status != 200 || !res.data) {
				ctx.body=[];
				return;	
			}

			res = res.data;
			res.forEach(function(s){
				var agency = s.id.split(':')[0];
				if(!s.code) s.code=s.id.split(':')[1];
				s.id = agency+':'+s.code;
				//s.cluster = global.zonesOTP[agency+':'+s.cluster];
				if(!!global.otp.idParentStations[agency+':'+s.cluster]) {
					s.cluster = global.otp.idParentStations[agency+':'+s.cluster];
				}
				if (!s.cluster) {
					s.cluster = "UNKOWN:UNKOWN";
					console.log('Probleme import horaires : s.cluster = "UNKOWN:UNKOWN" id=' + id);
				}
			});

			ctx.body=res;
		}
	} catch(e){
		main.dumpError(e,'otpHoraires.routeStops');
	}
	ctx.body=res;
}
//http://data.metromobilite.fr/api/routers/default/index/stops/SEM:0910/stoptimes/20160916
//http://localhost:3000/api/routers/default/index/stops/SEM:0910/stoptimes/20160916
async function stoptimesDate(ctx){
	try {
		var router = ctx.request.params.router;
		var id = ctx.request.params.id;
		var date = ctx.request.params.date;
		ctx.body = [];

		if(!id || !global.otp.stops[id.toUpperCase()]) return ;
		id=global.otp.stops[id.toUpperCase()].id;
		var options = {url:urlOtp+'/routers/'+router+'/index/stops/'+id+'/stoptimes/'+date, timeout: 5000,responseType: 'json',method:'get'};
		if(!options) return ;
		else {
			if(main.isDebug()) console.log(options.url);

			var res = await axios(options);
			if(res.status != 200 || !res.data) return ;

			res = parseResponseOTP(res.data);

			ctx.body=res;
		}
	} catch(e){
		main.dumpError(e,'otpHoraires.stoptimesDate');
	}
	ctx.body=res;
}
//http://data.metromobilite.fr/api/routers/default/index/stops/SEM:0910/patterns
//http://localhost:3000/api/routers/default/index/stops/SEM:0910/patterns
async function stopsPatterns(ctx){
	try {
		var router = ctx.request.params.router;
		var id = ctx.request.params.id;
		ctx.body = [];

		if(!id || !global.otp.stops[id.toUpperCase()]) return ;
		id=global.otp.stops[id.toUpperCase()].id;
		var options = {url:urlOtp+'/routers/'+router+'/index/stops/'+id+'/patterns', timeout: 5000,responseType: 'json',method:'get'};
		if(!options) return ;
		else {
			if(main.isDebug()) console.log(options.url);

			var res = await axios(options);
			if(res.status != 200 || !res.data) return ;

			var resp= res.data;
			for (var i=0 ; i < resp.length ; i++) {
				resp[i].shortDesc = '';
				var start = resp[i].desc.indexOf(' to ');
				var end = resp[i].desc.indexOf(' (');
				if (start != -1 && end != -1) {
					resp[i].desc= resp[i].desc.slice(start+4,end);
					resp[i].desc=resp[i].desc.substr(resp[i].desc.indexOf(",") + 2);
					resp[i].shortDesc = resp[i].desc.substring(0,15);
				}
				resp[i].dir = 1 + parseInt(resp[i].id.split(':')[2]);

				var idPattern = ''+resp[i].id;

				var tmp = resp[i].id.split(':');
				tmp[1]=global.otp.idRoutes[tmp[0]+':'+tmp[1]].split(':')[1];
				resp[i].id = tmp.join(':');

				var tmp2 = resp[i].id.split(':');
				var pattern = global.otp.routesPatterns[tmp2[0]+':'+tmp2[1]].dir[tmp2[2]].patterns[idPattern]
				resp[i].lastStop = pattern.stops[pattern.stops.length-1].code;
			}
			ctx.body = resp;
		}
	} catch(e){
		main.dumpError(e,'otpHoraires.stopsPatterns');
	}
}
//http://data.metromobilite.fr/api/routers/default/index/stops/SEM:0910/routes
//http://localhost:3000/api/routers/default/index/stops/SEM:0910/routes
async function stopRoutes(ctx){
	try {
		var router = ctx.request.params.router;
		var id = ctx.request.params.id;
		ctx.body = [];

		if(!id || !global.otp.stops[id.toUpperCase()]) return;
		id=global.otp.stops[id.toUpperCase()].id;
		var options = {url:urlOtp+'/routers/'+router+'/index/stops/'+id+'/routes', timeout: 5000,responseType: 'json',method:'get'};
		if(!options) return;
		else {
			if(main.isDebug()) console.log(options.url);

			var res = await axios(options);
			if(res.status != 200 || !res.data) return;

			var resp= res.data;
			for (var i=0 ; i < resp.length ; i++) {
				var code = global.otp.idRoutes[resp[i].id];
				resp[i] = JSON.parse(JSON.stringify(global.otp.routes[code]));
				resp[i].id = code;
			}
			ctx.body=resp;
		}
	} catch(e){
		main.dumpError(e,'otpHoraires.stopRoutes');
	}
}
// http://data.metromobilite.fr/api/ficheHoraires/json?route=SEM:C&time=1449593400000&router=default
// http://127.0.0.1:3000/api/ficheHoraires/json?route=SEM:12&time=1486402800000&router=default&pivot_0_stop_id=SEM:0503&pivot_0_delai=0&pivot_1_stop_id=SEM:0884&pivot_1_delai=0
async function ficheHoraires(ctx){
	try{
		var params = querystring.parse(ctx.querystring);
		if (!params.time) params.time=new Date().getTime();
		if (!params.route) {
			ctx.body={};
			return;
		}
		var pivots = JSON.parse(JSON.stringify(getPoteauxPivot(params)));
		if (params.pivot_0_stop_id) {
			pivots['0'].stop_id = params.pivot_0_stop_id;
			pivots['0'].delai = '0';
			if(params.pivot_0_delai) pivots['0'].delai = params.pivot_0_delai;
		}
		if (params.pivot_1_stop_id) {
			pivots['1'].stop_id = params.pivot_1_stop_id;
			pivots['1'].delai = '0';
			if(params.pivot_0_delai) pivots['1'].delai = params.pivot_1_delai;
		}
		if(!pivots || pivots == {}) console.log(params);

		pivots['0'].dirId = '0';
		pivots['0'].time = (+params.time) /*- 5*60*1000*/ + (+pivots['0'].delai*1000); // + : pour convertir en entier
		var dateObj = new Date(pivots['0'].time);
		var month = ""+(dateObj.getUTCMonth() + 1);
		var day = ""+dateObj.getUTCDate();
		var year = ""+dateObj.getUTCFullYear();
		pivots['0'].date = year+(month.length>1?'':'0')+month+(day.length>1?'':'0') + day;
		pivots['0'].serviceDay = year+'-'+(month.length>1?'':'0')+month+'-'+(day.length>1?'':'0') + day;

		var tasksRes;
		var tasks = [getFicheHorairesPoteau(pivots['0'],params)];

		if(pivots['1']) {
			pivots['1'].dirId = '1';
			pivots['1'].time = (+params.time) /*- 5*60*1000*/ + (+pivots['1'].delai*1000); // + : pour convertir en entier
			var dateObj = new Date(pivots['1'].time);
			var month = ""+(dateObj.getUTCMonth() + 1);
			var day = ""+dateObj.getUTCDate();
			var year = ""+dateObj.getUTCFullYear();
			pivots['1'].date = year+(month.length>1?'':'0')+month+(day.length>1?'':'0') + day;
			pivots['1'].serviceDay = year+'-'+(month.length>1?'':'0')+month+'-'+(day.length>1?'':'0') + day;
			tasks.push(getFicheHorairesPoteau(pivots['1'],params));
		}

		tasksRes = await axios.all(tasks);

		if(params.route=='SEM:16' && params.time >= new Date('2017/10/02 03:00').getTime() && params.time <= new Date('2017/11/18 03:00').getTime() ){
			tasksRes[0].pivot2={stop_id:'SEM:1113',delai:0};
			tasksRes[1].pivot2={stop_id:'SEM:0884',delai:0};
		}
		var res = {0:tasksRes[0]};
		if(tasksRes.length>1) res['1']=tasksRes[1];
		ctx.body = res;
	} catch(e){
		main.dumpError(e,'otpHoraires.ficheHoraires');
	}
}
// http://data.metromobilite.fr/api/routers/default/index/stops/SEM:3207/stoptimes
async function stopStoptimes(ctx){
	try {
		var router = ctx.request.params.router;
		var id = ctx.request.params.id;
		ctx.body = [];

		if(!id) return;
		id=id.toUpperCase();
		var tasks = [];
		var tasksRes = [];
		var options = getOptions(id,router);
		if(!options) {
			if (!global.otp.stops[id])
				ctx.set('MM-STOPTIMES-STATUS','WRONG_ID');
			else
				ctx.set('MM-STOPTIMES-STATUS','REMOTE_TIMEOUT');
			return;
		}
		if(main.isDebug()) console.log(options.url);
		tasks.push(axios(options));
		var optionsSec;
		var idSec = global.refStopsLinks.objects[id];
		if(idSec) {
			optionsSec = getOptions(idSec,router);
			if (optionsSec) {
				if(main.isDebug()) console.log(optionsSec.url);
				tasks.push(axios(optionsSec));
			}
		}
		tasksRes = await axios.all(tasks);

		var res = [];
		if(tasksRes[0] && tasksRes[0].data) {
			res=res.concat(parseResponse(tasksRes[0].data));
		} else {
			console.log('ECHEC de recuperation des horaires : '+options);
			ctx.set('MM-STOPTIMES-STATUS','REMOTE_TIMEOUT');
		}
		if (optionsSec) {
			if(tasksRes[1] && tasksRes[1].data) {
				res=res.concat(parseResponse(tasksRes[1].data));
			} else {
				console.log('ECHEC de recuperation des horaires : '+optionsSec);
				ctx.set('MM-STOPTIMES-STATUS','REMOTE_TIMEOUT');
			}
		}
		if(res.length>0 && res[0].times>0)
			res[0].times[0].stopName=global.otp.stops[id].name;
		ctx.body=res;
	} catch(e){
		main.dumpError(e,'otpHoraires.stopStoptimes');
		if(e.message=='ETIMEDOUT') {
			ctx.set('MM-STOPTIMES-STATUS','REMOTE_TIMEOUT');
			test();
		}
	}
}
// http://data.metromobilite.fr/api/routers/default/index/clusters/SEM:GENCONDORCE/stoptimes?route=SEM:12
async function clusterStoptimes(ctx){
	try{
		var router = ctx.request.params.router;
		var id = ctx.request.params.id;
		ctx.body = [];

		var params = querystring.parse(ctx.querystring);
		if(params.route) params.route=params.route.replace('_',':');
		var tasks=[];
		var tasksRes=[];
		id=id.toUpperCase();

		if(!global.otp.parentStations[id] && !global.otp.clusters[id]) {
			ctx.set('MM-STOPTIMES-STATUS','WRONG_ID');
			return;
		}

		var poteaux = [];

		//on a passé en param un parentStation
		if(!global.otp.clusters[id] && !!global.otp.parentStations[id]) {
			global.otp.parentStations[id].clusters.forEach(function(c){
				if(!!global.otp.clusters[c]) {
					global.otp.clusters[c].stops.forEach(function(s){
						poteaux.push(s.id.split(':')[0]+':'+s.code);
					});
				}
			});
		} else {
			//on a passé en param un cluster OTP
			if(!!global.otp.clusters[id]) {
				global.otp.clusters[id].stops.forEach(function(s){
					poteaux.push(s.id.split(':')[0]+':'+s.code);
				});
			}
		}

		poteaux.forEach(function(p){
			//si on ne demande pas de route
			//ou si on demande une route et qu'elle passe par ce poteau
			//if(!params.route ||(params.route && global.poteaux[p] && global.poteaux[p].lgn.indexOf(params.route)!=-1)) {
			if(!params.route ||(params.route && global.otp.stops[p] && global.otp.stops[p].routes && global.otp.stops[p].routes.indexOf(params.route)!=-1)) {
				var options = getOptions(p,router);
				if(options) {
					if(main.isDebug()) console.log(options.url);
					tasks.push(axios(options));
				}
			}
		});

		try{
		//on attend la synchro sur le tableau
			tasksRes = await axios.all(tasks);
		} catch(e){
			if(e.message=='ETIMEDOUT') {
				main.dumpError(e,'/api/routers/'+router+'/index/clusters/'+id+'/stoptimes');
				ctx.set('MM-STOPTIMES-STATUS','REMOTE_TIMEOUT');
				test();
			} else {
				throw(e)
			}
		}
		var res = [];
		tasksRes.forEach(function(r,i){
			if(tasksRes[i].status == 200 && tasksRes[i].data)
				res=res.concat(parseResponse(tasksRes[i].data));
		});
		if(params.route) {
			var idRoute = params.route;
			res = res.filter(function(e){
				return (e.pattern && e.pattern.id.slice(0,e.pattern.id.indexOf(':',4)) == idRoute);
			});
		}
		res.sort(function (a, b) {
			var aTime = (a.times[0].realtimeDeparture ? a.times[0].realtimeDeparture : a.times[0].realtimeArrival);
			var bTime = (b.times[0].realtimeDeparture ? b.times[0].realtimeDeparture : b.times[0].realtimeArrival);
			if (aTime > bTime) {
			return 1;
			}
			if (aTime < bTime) {
			return -1;
			}
			return 0;
		});
		ctx.body=res;

	} catch(e){
		main.dumpError(e,'otpHoraires.clusterStoptimes');
		if(e.message=='ETIMEDOUT') {
			ctx.set('MM-STOPTIMES-STATUS','REMOTE_TIMEOUT');
			test();
		}
	}
}
// http://data.metromobilite.fr/api/routers/default/index/clusters/SEM:GENCONDORCE/routes
async function clusterRoutes(ctx){
	try{
		var router = ctx.request.params.router;
		var id = ctx.request.params.id;
		ctx.body = [];

		id=id.toUpperCase();

		if(!global.otp.parentStations[id] && !global.otp.clusters[id]) {
			ctx.set('MM-CLUSTER-ROUTES-STATUS','WRONG_ID');
			ctx.body = [];
		}
		else {
			var poteaux = [];

			//on a passé en param un parentStation
			if(!global.otp.clusters[id] && !!global.otp.parentStations[id]) {
				global.otp.parentStations[id].clusters.forEach(function(c){
					if(!!global.otp.clusters[c]) {
						global.otp.clusters[c].stops.forEach(function(s){
							poteaux.push(s.id.split(':')[0]+':'+s.code);
						});
					}
				});
			} else {
				//on a passé en param un cluster OTP
				if(!!global.otp.clusters[id]) {
					global.otp.clusters[id].stops.forEach(function(s){
						poteaux.push(s.id.split(':')[0]+':'+s.code);
					});
				}
			}
			var res=[];
			var dejaAjoutee={};

			poteaux.forEach(function(p){
				if (global.otp.stops[p] && global.otp.stops[p].routes) {
					global.otp.stops[p].routes.forEach(function(r){
						var route = global.lignesTypeesObj[r];
						if(!dejaAjoutee[r]) {
							res.push(route);
							dejaAjoutee[r]=true;
						}
					});
				}
			});
			ctx.body = res;
		}
	} catch(e){
		main.dumpError(e,'otpHoraires.clusterRoutes');
	}
}

//http://data.metromobilite.fr/api/ficheHoraires/pdf?route=SEM:C
//http://localhost:3000/api/ficheHoraires/pdf?route=SEM:C
//http://www.tag.fr/ftp/fiche_horaires/fiche_horaires_2014/HORAIRES_'+ligne.code.replace('SEM_','')
async function ficheHorairesPdf(ctx){
	try {
		var params = querystring.parse(ctx.querystring);

		var fileName = 'HORAIRES_'+params.route.replace('SEM:','')+'.pdf';
		var urlTag = main.getConfig().plugins.otpHoraires.urlFicheHorairesTag;

		var options = {
			url:urlTag+fileName, 
			timeout: 10000,
			responseType: 'arraybuffer',
			method:'get'
		};
		if(!options) ctx.body = [];
		else {
			if(main.isDebug()) console.log(options.url);

			var res = await axios(options);
			if(res.status != 200) {
				ctx.body=[];
				return;
			}
			var fileName = 'HORAIRES_'+params.route.replace('SEM:','')+'.pdf';
			ctx.set('Content-Type', 'application/pdf');
			ctx.set('Content-Transfer-Encoding', 'binary');
			ctx.set('Content-Disposition','attachment; filename=' + fileName);
			ctx.set('Accept-Ranges', 'bytes');
			ctx.set('Content-Length',res.headers['content-length']);
			ctx.body = res.data;
	
		}
	} catch(e){
		main.dumpError(e,'otpHoraires.ficheHorairesPdf');
	}
}

// * http://data.metromobilite.fr/api/gtfsRtStatus/json
async function getGtfsRtStatus(ctx){
	try{
		ctx.body = global.etatGtfsRt;
	} catch(e){
		main.dumpError(e,'/api/gtfsRtStatus/json');
	}	
}
// http://data.metromobilite.fr/api/routers/default/index/routes
async function getRoutes(ctx) {
	var router = ctx.request.params.router;
	//router : prevu mais non utilisé... pour l'instant
	var params = querystring.parse(ctx.querystring);
	if(!params.reseaux && !params.codes) ctx.body=global.lignesTypees;
	else {
		var res = [];
		if(params.reseaux) {
			var reseaux = params.reseaux.split(',');
			res = global.lignesTypees.filter(function(f){
				return (reseaux.indexOf(f.type)!=-1);
			});
		}
		if (params.codes) {
			var codes = params.codes.replace(/\_/g, ':').split(',');
			res = global.lignesTypees.filter(function(f){
				return (codes.indexOf(f.id)!=-1);
			});
		}
		ctx.body=res;
	}
}
exports.getEtatsServeurs = function() {
	//if (!global.etatsServeurs.OTP) exports.testOTP();
	for(var d in dependencies) {
		if (!global.etatsServeurs[d] && !!dependencies[d].test) dependencies[d].test();
	}
	return global.etatsServeurs;
}
exports.changeEtatServeur = function(serveur,etat) {
	changeEtatServeur(serveur,etat);
}
var changeEtatServeur = function(serveur,etat) {
	global.etatsServeurs[serveur]=etat;
	if(!etat) global.etatsServeurs['lastFail'+serveur]=new Date().getTime();
	main.eventEmitter.emit('changeEtatServeur',global.etatsServeurs);
	
	changeEtatLiaisonServeur(serveur,etat);
}
exports.changeEtatLiaisonServeur = function(serveur,etat) {
	changeEtatLiaisonServeur(serveur,etat);
}
function changeEtatLiaisonServeur(serveur,etat){
	var oldLifecycle = global.liaisonsServeurs[serveur].lifecycle;
	if(etat) global.liaisonsServeurs[serveur].lifecycle = OK;
	else if (global.liaisonsServeurs[serveur].lifecycle != NOT_INITIALIZED) global.liaisonsServeurs[serveur].lifecycle = CONNECTION_LOST;
	//sinon on laisse a non initialisé
	if(oldLifecycle != global.liaisonsServeurs[serveur].lifecycle)
		main.eventEmitter.emit('liaisonsServeurs',{serveur:serveur, etat: global.liaisonsServeurs});
}
var changeEtatOTPRealTime = function(routeCode,bRealTime) {
	global.etatsServeurs.realTimeOTP[routeCode]=bRealTime;
	main.eventEmitter.emit('changeEtatServeur',global.etatsServeurs);
}

function loadPivots(config) {
	var json;
	//fs.readFile(config.dataPath+'pivots.json', 'utf8', function (err, data) {
	fs.readFile(config.dataPath+config.plugins.otpHoraires.pivotsFichesHoraires, 'utf8', function (err, data) {
		if (err) main.dumpError(err,'loadPivots');
		json = JSON.parse(data);
		global.pivots = json;
	});
}

function getPoteauxPivot(params) {
	var codeLigne = params.route.replace('_',':');
	if(!global.pivots[codeLigne+'_0'] && !global.pivots[codeLigne+'_1'] ) return {};

	return {0:global.pivots[codeLigne+'_0'],1:global.pivots[codeLigne+'_1']};
}
// TODO en graphQL avec pickupType : 
//{ "query": "{ stop(id: \"SEM:3655\") { name code stoptimesForServiceDate(date:\"20180403\") { pattern{ route{ gtfsId shortName } directionId headsign } stoptimes { scheduledDeparture pickupType trip{ gtfsId stoptimes{ stop{ gtfsId name } scheduledDeparture } } } } } }" }
async function getFicheHorairesPoteau(poteau,params) {
	var date = params.date;
	if (!params.router) params.router = 'default';
	var id = global.otp.stops[poteau.stop_id].id;
	var url = urlOtp+'/routers/'+params.router+'/index/stops/'+id+'/stoptimes/'+poteau.date;
	if(main.isDebug()) console.log(url);
	var resTimesPivot = await axios({url:url, timeout: 5000,responseType: 'json',method:'get'});
	if(resTimesPivot.status != 200 || !resTimesPivot.data) return [];

	var resTrips = getTripsOptions(resTimesPivot.data,params,poteau);
	var trips = resTrips.trips;
	var tasks = [];
	var tasksRes = [];
	for(var i=0;i<trips.length;i++){
		var url = urlOtp+'/routers/'+params.router+'/index/trips/'+trips[i].tripId+'/stoptimes';
		if(main.isDebug()) console.log(url);
		tasks.push(axios({url:url, timeout: 10000,responseType: 'json',method:'get'}));
	}
	tasksRes = await axios.all(tasks);

	return formatFicheHoraire(tasksRes,resTrips.prevTime,resTrips.nextTime);
}

function getTripsOptions(resTimesPivot,params,poteau) {
	var trips = [];
	for(var i=0;i<resTimesPivot.length;i++){
		var currentPattern = resTimesPivot[i];
		if(!currentPattern || !currentPattern.pattern) continue;
		var tabPattern = currentPattern.pattern.id.split(':');
		//verification de l'id route
		var idRoute = global.otp.routes[params.route].id;
		if(tabPattern[0]+':'+tabPattern[1] != idRoute) continue;
		if(tabPattern[2] != poteau.dirId) continue;
		var trips_presents={};
		for(var j=0;j<currentPattern.times.length;j++){
			if(!trips_presents[''+currentPattern.times[j].tripId]) {
				trips.push({tripId:currentPattern.times[j].tripId,time:parseInt(currentPattern.times[j].scheduledDeparture)});
				trips_presents[''+currentPattern.times[j].tripId]=true;
			}
		}
	}
	trips=trips.sort(function (a, b) {
	  if (a.time > b.time) {
		return 1;
	  }
	  if (a.time < b.time) {
		return -1;
	  }
	  return 0;
	});
	var idx=0;
	var heure_demandee = (poteau.time - new Date(poteau.serviceDay).getTime())/1000;
	for(var k=0;k<trips.length;k++){
		var t = trips[k].time;
		if (t >= heure_demandee) {
			idx = k;
			break;
		}
	}
	var idxPrev = (idx-nbTripsStatique>0?idx-nbTripsStatique:0);
	var idxNext = (idx+nbTripsStatique<trips.length-1?idx+nbTripsStatique:trips.length-1);
	var prevTime = (trips[idxPrev]?new Date(poteau.serviceDay).getTime() + trips[idxPrev].time*1000 - poteau.delai*1000:null);
	var nextTime = (trips[idxNext]?new Date(poteau.serviceDay).getTime() + trips[idxNext].time*1000 - poteau.delai*1000:null);
	return {trips:trips.slice(idx,idx+nbTripsStatique),prevTime:prevTime,nextTime:nextTime};
}

function formatFicheHoraire(taskres,prevTime,nextTime) {
	var res = [];
	var arrets = {};
	var trips =[];
	var liste_arrets=[];

	for(var i=0;i<taskres.length;i++){
		var trip = taskres[i].data;
		var arrets_trip = {};
		var apres = false;
		var last_liste_arrets_idx = -1;
		for(var j=0;j<trip.length;j++){
			var stop = trip[j];
			// on definit un pseudo_id pour le cas ou un arret est desservit 2 fois dans le trip.
			if(!arrets_trip[stop.stopId]) arrets_trip[stop.stopId]=0;
			arrets_trip[stop.stopId]++;
			var pseudo_id = stop.stopId+'_'+arrets_trip[stop.stopId];
			if(!arrets[pseudo_id]) arrets[pseudo_id]={stopId:stop.stopId, pseudo_id:pseudo_id, trips:[]};
			//on stoque l'heure de passage a l'arret pour ce trip.
			arrets[pseudo_id].trips[i]=stop.scheduledDeparture;
			//on constitue la liste triée des arrets en inserant les arrets inconnus au bon index.
			var idx = liste_arrets.indexOf(pseudo_id);
			if(idx==-1) {
				liste_arrets.splice(last_liste_arrets_idx+1,0,pseudo_id);
				last_liste_arrets_idx = last_liste_arrets_idx+1;
			} else {
				last_liste_arrets_idx = idx;
			}
		}
	}
	//conversion en tableau a partir de la liste triée
	var tab_arrets=[];
	for(var k=0;k<liste_arrets.length;k++){
		tab_arrets.push(arrets[liste_arrets[k]]);
	}

	var nbTrips = (nbTripsStatique>taskres.length?taskres.length:nbTripsStatique);
	for(var l=0;l<tab_arrets.length;l++){
		for(var m=0;m<nbTrips;m++){
			if(!tab_arrets[l].trips[m]) tab_arrets[l].trips[m] = '|';
		}
		delete tab_arrets[l].pseudo_id;
		var stopId = global.otp.idStops[tab_arrets[l].stopId];
		tab_arrets[l].stopId = stopId;
		tab_arrets[l].stopName = global.otp.stops[stopId].name;
		tab_arrets[l].lat = global.otp.stops[stopId].lat;
		tab_arrets[l].lon = global.otp.stops[stopId].lon;
		tab_arrets[l].parentStation = global.otp.idParentStations[stopId.split(':')[0]+':'+global.otp.stops[stopId].cluster];
	}

	return {arrets:tab_arrets,prevTime:prevTime,nextTime:nextTime};
}
function parseResponse (resp) {
	try{
		if(!resp.Data) return parseResponseOTP(resp,true); // OTP
		for(var d in dependencies) {
			if (!!dependencies[d].isMyResponse && dependencies[d].isMyResponse(resp)) return dependencies[d].parseResponse(resp);
		}
		return [];
	} catch(e){
		main.dumpError(e,'otpHoraires.parseResponse');
	}
}

function test() {
	for(var d in dependencies) {
		dependencies[d].test;
	}
	//exports.testOTP();
}

var parseResponseOTP = function(resp,bChangeEtat){
	if(resp[0]) {
		for (var i=0 ; i < resp.length ; i++) {
			var bRealTime = false;
			var routeCode = false;
			var patternIdOtp= [];
			if(resp[i].pattern) {
				resp[i].pattern.shortDesc = '';
				//calcul des destinations courtes et longues
				var start = resp[i].pattern.desc.indexOf(' to ');
				var end = resp[i].pattern.desc.indexOf(' (');
				if (start != -1 && end != -1) {
					resp[i].pattern.desc= resp[i].pattern.desc.slice(start+4,end);
					resp[i].pattern.desc=resp[i].pattern.desc.substr(resp[i].pattern.desc.indexOf(",") + 2).toUpperCase();
					resp[i].pattern.shortDesc = resp[i].pattern.desc.substring(0,15).toUpperCase();
				}
				//calcu des directions
				resp[i].pattern.dir = 1 + parseInt(resp[i].pattern.id.split(':')[2]);

				//on met le bon code ligne dans l'id pattern
				patternIdOtp = resp[i].pattern.id.split(':');

				var tmp = resp[i].pattern.id.split(':');
				tmp[1]=global.otp.idRoutes[tmp[0]+':'+tmp[1]].split(':')[1];
				resp[i].pattern.id = tmp.join(':');
				routeCode = tmp[0]+':'+tmp[1];
			}
			
			if(resp[i].times) {
				resp[i].times.forEach(function(t){
					var id = global.otp.idStops[t.stopId];
					t.stopName=global.otp.stops[id].name;
					t.stopId=id;
					if (!!t.realtime && !!routeCode) bRealTime=true;
					if (t.tripId) t.tripId = parseInt(t.tripId.substr(4));

					// mise à null les [realtimeDeparture ,scheduledDeparture ] pour le terminus pour pallier à
					// l'affichage de prochainpassage si on es au ternimus
					var pattern = global.otp.routesPatterns[routeCode].dir[patternIdOtp[2]].patterns[patternIdOtp.join(':')];
					var lastStop = pattern.stops[pattern.stops.length-1].code; 
					if (t.stopId == lastStop) {
						t.realtimeDeparture= null;
						t.scheduledDeparture=null;
						t.departureDelay =0;
						t.arrivalDelay=0;
					}
 
 				});
			}
			if(!!routeCode && global.etatsServeurs.realTimeOTP[routeCode]!=bRealTime && bChangeEtat) {
				changeEtatOTPRealTime(routeCode,bRealTime);
			}
		}
	} else {
		resp = [];
	}
	return resp;
};

var getOptions = function(idOtp,router) {
	var agency = idOtp.substr(0,3);
	if (!global.otp.stops[idOtp]) return false;
	var opt;
	if (!!dependencies[agency] && !!dependencies[agency].getOptions) opt = dependencies[agency].getOptions(idOtp);
	if(global.etatsServeurs[agency] && opt) {
		return opt;
	} else if(global.etatsServeurs.OTP) {
		if(!global.etatsServeurs[agency] && !!dependencies[agency] && !!dependencies[agency].getOptions) dependencies[agency].test();
		var id = global.otp.stops[idOtp].id;
		return {url:urlOtp+'/routers/'+router+'/index/stops/'+id+'/stoptimes' + (numberOfDepartures!=2?'?numberOfDepartures='+numberOfDepartures:''), timeout: 10000,responseType: 'json',method:'get'};
	} else {
		//exports.testOTP();
		return false;
	}
};
