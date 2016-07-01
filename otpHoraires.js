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
// prochains passages au poteau ou a une zone d'arret
// les données temps reel peuvent soit etre dans OTP directement soit etre integrées dans des modules additionels specifiques a chaque prestataire(reseau de urbain et departement par exemple) 
// on peut etablir des associations entre les poteaux des reseaux primaires et secondaires(reseau de urbain et departement par exemple) quand ils sont physiquement les mêmes

var kRequest = require('koa-request');
var querystring = require('querystring');
var fs = require('fs');

var main = require('./index');

var urlOtp;
global.otp = {
	stops:{},
	idStops:{},
	clusters:{},
	idClusters:{},
	routes:{},
	idRoutes:{}
};
global.pivots={};
global.etatsServeurs = {OTP:false,lastFailOTP:false};
global.refStopsLinks={"type": "FeatureCollection", "features": [], objects:{}};

var nbTripsStatique;
var dependencies = {};

exports.init = function *() {
	var config = main.getConfig();
	nbTripsStatique = config.plugins.otpHoraires.nbTripsStatique;
	loadPivots(config);
	urlOtp = config.plugins.otpHoraires.url;
	yield exports.testOTP();

	for(var d in config.plugins.otpHoraires.dependencies) {
		var file = require('./' + d);
		dependencies[config.plugins.otpHoraires.dependencies[d].agency] = file;
		if(!!file.getStatique) yield file.getStatique();
	}
	
	if(config.plugins.otpHoraires.stopLinks && config.plugins.otpHoraires.stopLinks.file) {
		var file = config.plugins.otpHoraires.stopLinks.file;
		var primaryAgency = config.plugins.otpHoraires.stopLinks.primaryAgency;
		var secondaryAgency = config.plugins.otpHoraires.stopLinks.secondaryAgency;
		var data = fs.readFileSync(config.dataPath+file, 'utf8');
		var json = JSON.parse(data);

		global.refStopsLinks.features=global.refStopsLinks.features.concat(json.features);

		json.features.forEach(function (f,index){
			global.refStopsLinks.objects[secondaryAgency+':'+f.properties.secondary_id.toUpperCase()]=primaryAgency+':'+f.properties.primary_id.toUpperCase();
			global.refStopsLinks.objects[primaryAgency+':'+f.properties.primary_id.toUpperCase()]=secondaryAgency+':'+f.properties.secondary_id.toUpperCase();
		});

	}
}

exports.getEtatsServeurs = function() {
	if (!global.etatsServeurs.OTP) exports.testOTP();
	for(var d in dependencies) {
		if (!global.etatsServeurs[d]) dependencies[d].test();
	}
	return global.etatsServeurs;
}
exports.changeEtatServeur = function(serveur,etat) {
	changeEtatServeur(serveur,etat);
}

exports.testOTP = function *() {
	try{
		if(global.etatsServeurs.lastFailOTP && global.etatsServeurs.lastFailOTP + 60000 > new Date().getTime()) {
			return false;
		}
		var res = yield kRequest.get({url:urlOtp, timeout: 10000,json: true});
		if(res.body) {
			if(global.etatsServeurs.OTP) {
				return true;
			} else {
				yield load(main.getConfig());
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
}

exports.initKoa = function (app,route) {
	var urlOtp = main.getConfig().plugins.otpHoraires.url;
	// * http://data.metromobilite.fr/api/serverStatus/json
	app.use(route.get('/api/serverStatus/json', function *() {
		try{
			this.body = exports.getEtatsServeurs();
		} catch(e){
			main.dumpError(e,'/api/serverStatus/json');
		}
	}));

	// http://data.metromobilite.fr/api/routers/default/index/routes
	app.use(route.get('/api/routers/:router/index/routes', function *(router) {
		//router : prevu mais non utilisé... pour l'instant
		var params = querystring.parse(this.querystring);
		if(!params.reseaux && !params.codes) this.body=global.lignesTypees;
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
			this.body=res;
		}
	}));
	
	// http://data.metromobilite.fr/api/routers/default/index/routes/SEM:C/stops
	app.use(route.get('/api/routers/:router/index/routes/:id/stops', function *(router,id) {
		try {
			id=global.otp.routes[id.toUpperCase()].id;
			var options = {url:urlOtp+'/routers/'+router+'/index/routes/'+id+'/stops', timeout: 5000,json: true};
			if(!options) this.body = [];
			else {
				if(main.isDebug()) console.log(options.url);
				
				var res = yield kRequest.get(options);
				
				res = res.body;
				res.forEach(function(s){
					var part = s.id.split(':')[0];
					if(!s.code) s.code=s.id.split(':')[1];
					s.id = part+':'+s.code;
					s.cluster =  global.zonesOTP[part+':'+s.cluster];
					if (!s.cluster) {
						s.cluster = "UNKOWN:UNKOWN";
						console.log('Probleme import horaires : s.cluster = "UNKOWN:UNKOWN" id=' + id);
					}
				});
				
				this.body = res;
			}
		} catch(e){
			main.dumpError(e,'/api/routers/'+router+'/index/routes/'+id+'/stops');
		}
	}));
	
	// http://data.metromobilite.fr/api/ficheHoraires/json?route=SEM:C&time=1449593400000&router=default
	app.use(route.get('/api/ficheHoraires/json', function *() {
		try{
			var params = querystring.parse(this.querystring);
			if (!params.time) params.time=new Date().getTime();
			if (!params.route) return {};
			var pivots = getPoteauxPivot(params);
			if(!pivots || pivots == {}) console.log(params);

			pivots['0'].dirId = '0';
			pivots['0'].time = (+params.time) - 5*60*1000 + (+pivots['0'].delai*1000); // + : pour convertir en entier
			var dateObj = new Date(pivots['0'].time);
			var month = ""+(dateObj.getUTCMonth() + 1);
			var day = ""+dateObj.getUTCDate();
			var year = ""+dateObj.getUTCFullYear();
			pivots['0'].date = year+(month.length>1?'':'0')+month+(day.length>1?'':'0') + day;
			pivots['0'].serviceDay = year+'-'+(month.length>1?'':'0')+month+'-'+(day.length>1?'':'0') + day;
			
			var tasksRes;
			var tasks = {
				0:getFicheHorairesPoteau(pivots['0'],params)//,
				//1:getFicheHorairesPoteau(pivots['1'],params)
			};
			
			if(pivots['1']) {
				pivots['1'].dirId = '1';
				pivots['1'].time = (+params.time) - 5*60*1000 + (+pivots['1'].delai*1000); // + : pour convertir en entier
				var dateObj = new Date(pivots['1'].time);
				var month = ""+(dateObj.getUTCMonth() + 1);
				var day = ""+dateObj.getUTCDate();
				var year = ""+dateObj.getUTCFullYear();
				pivots['1'].date = year+(month.length>1?'':'0')+month+(day.length>1?'':'0') + day;
				pivots['1'].serviceDay = year+'-'+(month.length>1?'':'0')+month+'-'+(day.length>1?'':'0') + day;
				tasks['1']=getFicheHorairesPoteau(pivots['1'],params);
			}
			
			tasksRes = yield tasks;
			
			this.body = tasksRes;
		} catch(e){
			main.dumpError(e,'/api/ficheHoraires/json');
		}
	}));
	
	// http://data.metromobilite.fr/api/routers/default/index/stops/SEM:3207/stoptimes
	app.use(route.get('/api/routers/:router/index/stops/:id/stoptimes', function *(router,id) {
		try {
			var tasksRes={};
			id=id.toUpperCase();
			var options = getOptions(id,router);
			if(!options) {
				if (!global.otp.stops[id] && id.substr(0,3)!='C38') 
					this.set('MM-STOPTIMES-STATUS','WRONG_ID');
				else
					this.set('MM-STOPTIMES-STATUS','REMOTE_TIMEOUT');
				this.body = [];
			}
			else {
				if(main.isDebug()) console.log(options.url);
				var optionsSec;
				var tasks = {
					main:kRequest.get(options)
				};
				
				var idSec = global.refStopsLinks.objects[id];
				if(idSec) {
					optionsSec = getOptions(idSec,router);
					if (optionsSec) {
						if(main.isDebug()) console.log(optionsSec.url);
						tasks.sec=kRequest.get(optionsSec);
					}
				}
				//on attend la synchro sur l'objet
				tasksRes = yield tasks;
				
				var res = [];
				if(tasksRes.main && tasksRes.main.body) {
					res=res.concat(parseResponse(tasksRes.main.body));
				} else {
					console.log('ECHEC de recuperation des horaires : '+options);
					this.set('MM-STOPTIMES-STATUS','REMOTE_TIMEOUT');
				}
				if (optionsSec) {
					if(tasksRes.sec && tasksRes.sec.body) {
						res=res.concat(parseResponse(tasksRes.sec.body));
					} else {
						console.log('ECHEC de recuperation des horaires : '+optionsSec);
						this.set('MM-STOPTIMES-STATUS','REMOTE_TIMEOUT');
					}
				}
				if(res.length>0 && res[0].times>0)
					res[0].times[0].stopName=global.otp.stops[id].name;
				this.body = res;
			}
		} catch(e){
			main.dumpError(e,'/api/routers/'+router+'/index/stops/'+id+'/stoptimes');
			if(e.message=='ETIMEDOUT') {
				this.set('MM-STOPTIMES-STATUS','REMOTE_TIMEOUT');
				exports.test();
			}
		}
	}));
	
	// http://data.metromobilite.fr/api/routers/default/index/clusters/SEM:GENCONDORCE/stoptimes?route=SEM:12
	app.use(route.get('/api/routers/:router/index/clusters/:id/stoptimes', function *(router,id) {
		try{
			//var params=extractUrlParams(this.querystring);
			var params = querystring.parse(this.querystring);
			if(params.route)params.route=params.route.replace('_',':');
			var tasks=[];
			var tasksRes=[];
			id=id.toUpperCase();
			if(!global.zones[id]) {
				this.set('MM-STOPTIMES-STATUS','WRONG_ID');
				this.body = [];
			}
			else {
				var poteaux = [];
				// le C38 supporte une requete multipoteaux donc si on passe par leur API on ne split pas 
				// si on passe par otp il faut spliter la liste d'arrets C38

				if(global.zones[id].poteaux[0].substr(0,3)=='C38' && !global.etatsServeurs['C38']) {
					poteaux = global.zones[id].poteaux[0].split(',');
				} else {
					poteaux = global.zones[id].poteaux;
				}
				
				poteaux.forEach(function(p){
					if(!params.route || p.substr(0,3)=='C38' ||(params.route && global.poteaux[p] && global.poteaux[p].lgn.indexOf(params.route)!=-1)) {
						var options = getOptions(p,router);
						if(options) {
							if(main.isDebug()) console.log(options.url);
							tasks.push(kRequest.get(options));
						}
					}
				});
				var idSec = global.refStopsLinks.objects[id];

				if(global.zones[idSec]) {
					// le C38 supporte une requete multipoteaux donc si on passe par leur API on ne split pas 
					// si on passe par otp il faut spliter la liste d'arrets C38
					if(global.zones[idSec].poteaux[0].substr(0,3)=='C38' && !global.etatsServeurs['C38']) {
						poteaux = global.zones[idSec].poteaux[0].split(',');
					} else {
						poteaux = global.zones[idSec].poteaux;
					}

					poteaux.forEach(function(p){
						if(params.route || (params.route && global.poteaux[p] && global.poteaux[p].lgn.indexOf(params.route)!=-1)) {
							var options = getOptions(p,router);
							if(options) {
								if(main.isDebug()) console.log(options.url);
								tasks.push(kRequest.get(options));
							}
						}
					});
				}
				//on attend la synchro sur le tableau
				tasksRes = yield tasks;
				var res = [];
				tasksRes.forEach(function(r,i){
					if(tasksRes[i].body)
						res=res.concat(parseResponse(tasksRes[i].body));
				});
				if(params.route) {
					var idRoute = params.route;
					res = res.filter(function(e){
						return (e.pattern && e.pattern.id.slice(0,e.pattern.id.indexOf(':',4)) == idRoute);
					});
				}
				this.body = res;
			}
		} catch(e){
			main.dumpError(e,'/api/routers/'+router+'/index/clusters/'+id+'/stoptimes');
			if(e.message=='ETIMEDOUT') {
				this.set('MM-STOPTIMES-STATUS','REMOTE_TIMEOUT');
				exports.test();
			}
		}
	}));
	for(var d in dependencies) {
		if (!!dependencies[d].initKoa) dependencies[d].initKoa(app,route);
	}

}

var changeEtatServeur = function(serveur,etat) {
	global.etatsServeurs[serveur]=etat;
	if(!etat) global.etatsServeurs['lastFail'+serveur]=new Date().getTime();
	main.eventEmitter.emit('changeEtatServeur',global.etatsServeurs);
}

var load = function *(config) {
	try {
		var reqs = {
			stops:kRequest.get({url:urlOtp+'/routers/default/index/stops/', timeout: 10000,json: true}),
			routes:kRequest.get({url:urlOtp+'/routers/default/index/routes', timeout: 10000,json: true}),
		};
		var res = yield reqs;
		parseStops(res.stops);
		parseRoutes(res.routes);
		changeEtatServeur('OTP',true);
		console.log('OTP Initialisé !');
	} catch(e){
		console.log('ECHEC de otp.load code : '+err.code);
		exports.testOTP();
	}
}
var parseStops = function(resp) {
	//!!! même en mode router=test, on continu d'utiliser le router standard...
	resp.body.forEach(function (stop){
		var agency = stop.id.split(':')[0];
		if(!stop.code) stop.code=stop.id.split(':')[1];
		global.otp.stops[agency+':'+stop.code]=stop;
		global.otp.idStops[stop.id] = agency+':'+stop.code;
	});
	console.log('OTP stops : '+Object.keys(global.otp.stops).length+' elements');

	return true;
};

var parseRoutes = function(resp) {
	resp.body.forEach(function (line){
		var agency = line.id.split(':')[0];
		var id = agency+':'+line.shortName;
		global.otp.routes[id]= line;
		global.otp.idRoutes[line.id]=id;
	});
	console.log('OTP routes : '+Object.keys(global.otp.routes).length+' elements');

	return true;
};
function loadPivots(config) {
	var json;
	fs.readFile(config.dataPath+'pivots.json', 'utf8', function (err, data) {
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

var getFicheHorairesPoteau = function *(poteau,params) {
	var date = params.date;
	if (!params.router) params.router = 'default';
	var id = global.otp.stops[poteau.stop_id].id;
	var url = urlOtp+'/routers/'+params.router+'/index/stops/'+id+'/stoptimes/'+poteau.date;
	var tasks = [];
	var tasksRes = [];
	if(main.isDebug()) console.log(url);
	var resTimesPivot = yield kRequest.get({url:url, timeout: 10000,json: true});
	var resTrips = getTripsOptions(resTimesPivot.body,params,poteau);
	var trips = resTrips.trips;
	for(var i=0;i<trips.length;i++){
		var url = urlOtp+'/routers/'+params.router+'/index/trips/'+trips[i].tripId+'/stoptimes';
		if(main.isDebug()) console.log(url);
		tasks.push(kRequest.get({url:url, timeout: 10000,json: true}));
	}
	tasksRes = yield tasks;
	
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
		if (t > heure_demandee) {
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
		var trip = taskres[i].body;
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
	}
	return {arrets:tab_arrets,prevTime:prevTime,nextTime:nextTime};
}
function parseResponse (resp) {
	if(!resp.Data) return parseResponseOTP(resp); // OTP
	for(var d in dependencies) {
		if (dependencies[d].isMyResponse(resp)) return dependencies[d].parseResponse(resp);
	}
	return [];
}

function test() {
	for(var d in dependencies) {
		dependencies[d].test;
	}
	testOTP();
}

var parseResponseOTP = function(resp){
	if(resp[0]) {
		for (var i=0 ; i < resp.length ; i++) {
			if(resp[i].pattern) {
				resp[i].pattern.shortDesc = '';
				var start = resp[i].pattern.desc.indexOf(' to ');
				var end = resp[i].pattern.desc.indexOf(' (');
				if (start != -1 && end != -1) {
					resp[i].pattern.desc= resp[i].pattern.desc.slice(start+4,end);
					resp[i].pattern.desc=resp[i].pattern.desc.substr(resp[i].pattern.desc.indexOf(",") + 1);
					resp[i].pattern.shortDesc = resp[i].pattern.desc.substring(0,15);
				}
				resp[i].pattern.dir = 1 + parseInt(resp[i].pattern.id.split(':')[2]);
				//on met le bon code ligne dans l'id pattern
				var tmp = resp[i].pattern.id.split(':');
				tmp[1]=global.otp.idRoutes[tmp[0]+':'+tmp[1]].split(':')[1];
				resp[i].pattern.id = tmp.join(':');
			}
			if(resp[i].times) {
				resp[i].times.forEach(function(t){
					var id = global.otp.idStops[t.stopId];
					t.stopName=global.otp.stops[id].name;
					t.stopId=id;
				});
			}
		}
	} else {
		resp = [];
	}
	return resp;
};

var getOptions = function(idOtp,router) {
	var agency = idOtp.substr(0,3);
	if (!global.otp.stops[idOtp] && agency!='C38') return false;
	var opt;
	if (!!dependencies[agency] && !!dependencies[agency].getOptions) opt = dependencies[agency].getOptions(idOtp);
	if(global.etatsServeurs[agency] && opt) {
		return opt;
	} else if(global.etatsServeurs.OTP) {
		if(!global.etatsServeurs[agency] && !!dependencies[agency] && !!dependencies[agency].getOptions) dependencies[agency].test();
		//TODO gerer requetes C38 multi idOTP si C38 planté
		var id = global.otp.stops[idOtp].id;
		return {url:urlOtp+'/routers/'+router+'/index/stops/'+id+'/stoptimes', timeout: 10000,json: true};
	} else {
		testOTP();
		return false;
	}
};
