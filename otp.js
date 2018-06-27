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

// module otp principal

const Joi = require('koa-joi-router').Joi;
var axios = require('axios');
var querystring = require('querystring');
var fs = require('fs');
var CronJob = require('cron').CronJob;
var horaires = require('./otpHoraires');

var main = require('./index');
var jobWaitOTP=null;
var urlOtp;
exports.init = async function (config) {
	urlOtp = config.plugins.otpHoraires.url;
	try {
		jobWaitOTP = new CronJob({
			cronTime: '*/20 * * * * *',//toutes les 20 secondes
			onTick: test,
			runOnInit:true,
			start: true,
			timeZone: "Europe/Paris"
		});

	} catch(e){
		main.dumpError(e,'otp.init');
	}
}

async function wait(){
	try{
		jobWaitOTP.start();
	} catch(e){
		main.dumpError(e,'otp.wait');
	}
}
exports.test = async function () {
	if(global.etatsServeurs.lastFailOTP && global.etatsServeurs.lastFailOTP + 60000 > new Date().getTime()) {
		return false;
	}
	return await test();
}
async function test() {
	try{
		var res = await axios({url:urlOtp, timeout: 5000,responseType: 'json',method:'get'});
		if(res.data && res.status== 200) {
			if(global.etatsServeurs.OTP) {
				return true;
			} else {
				await checkGraphChange();
				return false;
			}
		} else {
			horaires.changeEtatServeur('OTP',false);
			console.error('Impossible de joindre OTP !');
			return false;
		}
	} catch(e){
		horaires.changeEtatServeur('OTP',false);
		console.error('Impossible de joindre OTP !');
		return false;
	}
}
async function checkGraphChange(){
	load(main.getConfig());
}
async function load(config) {
	try {
		var reqs = [
			axios({url:urlOtp+'/routers/default/index/stops/', timeout: 10000,responseType: 'json',method:'get'}),//stops
			axios({url:urlOtp+'/routers/default/index/routes', timeout: 10000,responseType: 'json',method:'get'}),//routes
			axios({url:urlOtp+'/routers/default/geocode?query=test', timeout: 60000,responseType: 'json',method:'get'}),//juste pour declencher le lazy loading des clusters
			axios({url:urlOtp+'/routers/default/index/clusters?detail=true', timeout: 120000,responseType: 'json',method:'get'}),//clusters
			axios({url:urlOtp+'/routers/default/index/graphql', timeout: 10000,responseType: 'json',method:'post', data:{ query: '{ routes{ gtfsId shortName patterns{ code directionId headsign trips { gtfsId } stops { gtfsId code name } } } }' }}),//patterns
		];
		// chargement stops et parent stations graphQL:
		// { "query": "{ stops{ gtfsId name lat lon code wheelchairBoarding parentStation{ gtfsId name lat lon code } } }" }

		const res = await axios.all(reqs);
		if(res[0].status ==200) parseStops(res[0].data);
		if(res[1].status ==200) parseRoutes(res[1].data);
		//initClusters non parsé
		if(res[3].status ==200) parseClusters(res[3].data);
		if(res[4].status ==200) parsePatterns(res[4].data);

		var reqRoutesStops = {};
		var reqRoutesStopsArr = [];
		for (var r in global.otp.routes){
			// on stocke pour chaque ligne (route) l'indice de son resultat dans le tableau
			var indice = reqRoutesStopsArr.push(axios({url:urlOtp+'/routers/default/index/routes/'+global.otp.routes[r].id+'/stops', timeout: 10000,responseType: 'json',method:'get'})) -1;
			reqRoutesStops[r]=indice;
		}
		const resRoutesStopsArr = await axios.all(reqRoutesStopsArr);

		parseRoutesStops(reqRoutesStops,resRoutesStopsArr);

		horaires.changeEtatServeur('OTP',true);
		main.eventEmitter.emit('otpLoaded');
		console.log('OTP Initialisé !');
		return false;
	} catch(e){
		console.erreur('ECHEC de otp.load : '+e.message);
		test();
		return false;
	}
}
var parseStops = function(resp) {
	//!!! même en mode router=test, on continu d'utiliser le router standard...
	resp.forEach(function (stop){
		var agency = stop.id.split(':')[0];
		if(!stop.code) stop.code=stop.id.split(':')[1];
		global.otp.stops[agency+':'+stop.code]=stop;
		global.otp.idStops[stop.id] = agency+':'+stop.code;
	});
	console.log('OTP stops : '+Object.keys(global.otp.stops).length+' elements');

	return true;
};

var parseRoutes = function(resp) {
	resp.forEach(function (line){
		var agency = line.id.split(':')[0];
		var code = agency+':'+line.shortName;
		global.otp.routes[code]= line;
		global.otp.idRoutes[line.id]=code;
	});
	console.log('OTP routes : '+Object.keys(global.otp.routes).length+' elements');

	return true;
};

var parseClusters = function(resp) {
	try {
		var config = main.getConfig()
		var jsonClusters = {type:"FeatureCollection",features:[]};
		var jsonStops = {type:"FeatureCollection",features:[]};
		var typeCluster = main.getConfig().plugins.otpHoraires.typeCluster;//'arret';
		var typeStops = main.getConfig().plugins.otpHoraires.typeStops;//'stops';
		typeCluster=(typeCluster?typeCluster:'cluster');
		typeStops=(typeStops?typeStops:'stop');

		//s'il y a un fichier points de même type (typeCluster) on l'utilise
		if(!!global.plugins.name['points'] && !!global.ref[typeCluster]) {
			global.ref[typeCluster].features.forEach(function (f){
				//if (f.properties.type == typeCluster) {
					global.otp.idParentStations[f.properties.id.replace('_',':')] = f.properties.CODE.replace('_',':');
				//}
			});
		}

		resp.forEach(function (c){
			var id = c.id;
			global.otp.clusters[id]= c;
			//if(!global.zones[id]) global.zones[id] = {poteaux:[]};

			var lastPrimaryStop=c.stops[0];

			c.stops.forEach(function (s){
				//on ajoute les clusters OTP
				//global.zones[id].poteaux.push(s.id.split(':')[0]+':'+s.code);

				var agency = s.id.split(':')[0];

				//on essaie d'utiliser le CODE du fichier typeCluster plutot que le parentStation du GTFS (s.cluster dansla reponse OTP)
				//le s.cluster correspond a l'id du fichier typeCluster
				var codeParentStation = global.otp.idParentStations[agency+':'+s.cluster];
				if(!codeParentStation) codeParentStation = agency+':'+s.cluster;

				//une parentStation peut avoir plusieurs cluster si les noms des poteaux sont differents
				if(!global.otp.parentStations[codeParentStation]) global.otp.parentStations[codeParentStation] = {clusters:[], stops:[]};
				if(global.otp.parentStations[codeParentStation].clusters.indexOf(c.id)==-1) global.otp.parentStations[codeParentStation].clusters.push(c.id);
				global.otp.parentStations[codeParentStation].stops.push(s.id);

				var stop = {
					type:"Feature",
					properties:{
						CODE:agency+':'+s.code,
						id:s.id,
						LIBELLE:s.name.split(', ')[1],
						COMMUNE:s.name.split(', ')[0],
						type:typeStops
					},
					geometry:{type:"Point", coordinates:[s.lon,s.lat]}
				};
				jsonStops.features.push(stop);

				if (config.plugins.otpHoraires.stopLinks.primaryAgency == agency) {
					//lastPrimaryStop = stop;
					lastPrimaryStop = s;
				}
			});
			var name = lastPrimaryStop.name;
			var cluster = {
				type:"Feature",
				properties:{
					CODE:c.id,
					id:c.id,
					LIBELLE:name.split(', ')[1],
					COMMUNE:name.split(', ')[0],
					type:typeCluster
				},
				geometry:{type:"Point", coordinates:[lastPrimaryStop.lon,lastPrimaryStop.lat]}
			};

			jsonClusters.features.push(cluster);
		});
		if(!!global.plugins.name['points']) {
			if(!main.getConfig().types[typeCluster]) {
				main.getConfig().types[typeCluster]={find:'LIBELLE'};
				global.ref[typeCluster]=jsonClusters;
			}
			if(!main.getConfig().types[typeStops]) {
				global.ref[typeStops]=jsonStops;
			}
		}

		console.log('OTP clusters : '+Object.keys(global.otp.clusters).length+' elements');

		return true;
	} catch(e){
		main.dumpError(e,'parseCluster');
	}
};
var parseRoutesStops = function(reqRoutesStops,resRoutesStopsArr) {
	for(var r in reqRoutesStops) {
		var indice = reqRoutesStops[r];
		if(resRoutesStopsArr[indice].status != 200) {
			console.error("parseRoutesStops : Erreur : " + resRoutesStopsArr[indice].status + " Message : " + resRoutesStopsArr[indice].statusText);
			return;
		}
		var stops = resRoutesStopsArr[indice].data;
		if(Array.isArray(stops)) {
			stops.forEach(function (s){
				var agency = s.id.split(':')[0];
				var code = (s.code?agency+':'+s.code:s.id);
				if(!global.otp.stops[code]) console.error('Missing stop : '+code);
				if(!global.otp.stops[code].routes) global.otp.stops[code].routes = [];
				global.otp.stops[code].routes.push(r);
			});
		} else
			console.error(stops);
	}
};
var parsePatterns = function(resp) {
/*{
	"data": {
		"routes": [{
		{
			"gtfsId": "C38:CPL01",
			"shortName": "CPL01",
			"patterns": [{
				"directionId": 0,
				"headsign": "LA CHAPELLE-EN-VERCORS, COLLEGE LA CHAPELLE",
				"trips": [{
					"gtfsId": "C38:6957521"
				}],
				"stops": [{*/
	var errDejaTracees={};
	resp.data.routes.forEach(function(r){
		var codeAgence = r.gtfsId.split(':')[0];
		var codeLigne = codeAgence+':'+r.shortName;
		global.otp.routesPatterns[codeLigne] = {dir:[{bestPattern:false, patterns:{}},{bestPattern:false, patterns:{}}],parentStations:[]};
		var bestPatterns=[{count:0,code:false},{count:0,code:false}];
		for(var i=0;i < r.patterns.length;i++){
			var p = r.patterns[i];
			var dir = parseInt(p.directionId);
			if(bestPatterns[dir].count < p.trips.length) {
				bestPatterns[dir] = {count:p.trips.length, code:p.code};
			}
			global.otp.routesPatterns[codeLigne].dir[dir].patterns[p.code]={headsign:p.headsign,stops:[]};
			for(var j=0;j < p.stops.length;j++){
				var s = p.stops[j];
				var code = (s.code == null?s.gtfsId:codeAgence+':'+s.code);
				global.otp.routesPatterns[codeLigne].dir[dir].patterns[p.code].stops.push({code:code});
			}
		}
		global.otp.routesPatterns[codeLigne].dir[0].bestPattern = bestPatterns[0].code;
		global.otp.routesPatterns[codeLigne].dir[1].bestPattern = bestPatterns[1].code;

		var parentStationsAjoutes = {};
		for(var i=0;i < global.otp.routesPatterns[codeLigne].dir.length;i++){
			var dir = global.otp.routesPatterns[codeLigne].dir[i];
			var codeLigne = codeLigne;
			var parentStationsAjoutes = parentStationsAjoutes;
			if(Object.keys(dir.patterns).length == 0) continue;
			//on commence par le meilleur
			for(var j=0;j < dir.patterns[dir.bestPattern].stops.length;j++){
				var s = dir.patterns[dir.bestPattern].stops[j];
				var obj=getParentStationFromStop(s,errDejaTracees);

				if(!parentStationsAjoutes[obj.code]) {
					global.otp.routesPatterns[codeLigne].parentStations.push(obj);
					parentStationsAjoutes[obj.code]=true;
				}
			}
			//puis on parcours les autres pour etre sur de ne rien oublier
			for(var p in dir.patterns){
				for(var j=0;j < dir.patterns[p].stops.length;j++){
					var s = dir.patterns[p].stops[j];
					var obj=getParentStationFromStop(s,errDejaTracees);

					if(!parentStationsAjoutes[obj.code]) {
						global.otp.routesPatterns[codeLigne].parentStations.push(obj);
						parentStationsAjoutes[obj.code]=true;
					}
				}
			}
		}
	});
}
function getParentStationFromStop(s,errDejaTracees){
	var codeAgence = s.code.split(':')[0];
	var obj={};
	var typeCluster = main.getConfig().plugins.otpHoraires.typeCluster;
	if(!!global.plugins.name['points'] && typeCluster != 'cluster') {
		var codeParentStation = global.otp.idParentStations[codeAgence+':'+global.otp.stops[s.code].cluster];

		if (global.parentStationsFromPoint[codeParentStation]) {
			obj = global.parentStationsFromPoint[codeParentStation];
		} else if(!errDejaTracees[codeAgence+':'+global.otp.stops[s.code].cluster] && ['GSV','TPV','SNC','1','3'].indexOf(codeAgence)==-1 ){
			console.log('Missing parentStation : '+codeAgence+':'+global.otp.stops[s.code].cluster+' in point file : '+typeCluster);
			errDejaTracees[codeAgence+':'+global.otp.stops[s.code].cluster]=true;
		}

	} else {
		obj = {
			code:codeAgence+':'+global.otp.stops[s.code].cluster,
			name:global.otp.stops[s.code].name,
			lon:s.lon,
			lat:s.lat
		}
	}
	return obj;
}