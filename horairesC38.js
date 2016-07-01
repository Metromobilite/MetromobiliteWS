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

// dependence du module otpHoraires pour les données temps reel du reseau departemental (reseau secondaire)
var kRequest = require('koa-request');

var main = require('./index');
var otpHoraires = require('./otpHoraires');

var urlC38;
global.C38 = {
	stops:{},
	routes:{}
};

exports.getStatique = function *() {
	var config = main.getConfig();
	urlC38 = config.plugins.otpHoraires.dependencies.horairesC38.url;
	keyC38 = config.plugins.otpHoraires.dependencies.horairesC38.key;
	global.etatsServeurs['C38']=false;
	global.etatsServeurs['lastFailC38']=false;
	yield exports.test();
}

exports.test = function *() {
	try{
		if(global.etatsServeurs.lastFailC38 && global.etatsServeurs.lastFailC38 + 60000 > new Date().getTime()) {
			return false;
		}
		var resp = yield kRequest.get({url:urlC38+'/transport/v3/trippoint/GetCategoriesIds/json?true=true'+keyC38, timeout: 10000,json: true});
		if(!!resp.body && resp.body.StatusCode == 200) {
			if(global.etatsServeurs.C38) 
				return true;
			else {
				yield load(main.getConfig());
				return true;
			}
		} else {
			otpHoraires.changeEtatServeur('C38',false);
			console.log('ECHEC de horairesC38.test code : '+(resp.body?resp.body.StatusCode:'???'));
			console.log('Prochaine tentative : '+new Date(global.etatsServeurs.lastFailC38+60000).toLocaleTimeString());
			return false;
		}
	} catch(e){
		otpHoraires.changeEtatServeur('C38',false);
		console.log('ECHEC de horairesC38.test');
		console.log('Prochaine tentative : '+new Date(global.etatsServeurs.lastFailC38+60000).toLocaleTimeString());
		return false;
	}
};
exports.getOptions = function(idOtp){
	var idsC38 = [];
	idOtp.split(',').forEach(function(i){if(global.otp.stops[i]) idsC38.push(global.otp.stops[i].c38Id);});
	return {url:urlC38+'/transport/v3/timetable/GetStopHours/json?MaxItemsByStop=6'+keyC38+'&TimeTableType=RealTime&StopIds='+idsC38.join('|'), timeout: 5000,json: true};
}
exports.isMyResponse = function(resp){
	return (resp.Data.Hours);
}
exports.parseResponse = function(resp){
	var res = [];
	var patterns = {};
	var vehicleJourneys={};
	
	var now = new Date();
	now.setHours(12,0,0,0);//midi
	//-12h pour le jours de changement d'heure
	now=new Date(now.getTime()-12*60*60*1000);

	var serviceDay = now;
	
	for (var j=0 ; j < resp.Data.VehicleJourneys.length ; j++) {
		vehicleJourneys[''+resp.Data.VehicleJourneys[j].Id]={journeyId:resp.Data.VehicleJourneys[j].JourneyId,journeyDestination:resp.Data.VehicleJourneys[j].JourneyDestination,JourneyDirection:resp.Data.VehicleJourneys[j].JourneyDirection};
	}
	for (var i=0 ; i < resp.Data.Hours.length ; i++) {
		var l = resp.Data.Hours[i];
		var line = 'C38:'+global.C38.routes[l.LineId].Number;
		var journeyId = ''+vehicleJourneys[''+l.VehicleJourneyId].journeyId;
		var dest = vehicleJourneys[''+l.VehicleJourneyId].journeyDestination;
		var dir = vehicleJourneys[''+l.VehicleJourneyId].JourneyDirection;
		if (!patterns[journeyId]) {
			patterns[journeyId] = {
				pattern : {
					id : line+':'+journeyId,
					desc : dest,
					dir : dir,
					shortDesc : dest.substring(0,15)
				},
				times :[]
			};
		}
		var bRealTime = true;
		var realTime = parseInt(l.PredictedDepartureTime);
		if(!realTime) {
			bRealTime = false;
			realTime = parseInt(l.AimedDepartureTime);
			if(!realTime) {
				realTime = parseInt(l.TheoricDepartureTime);
			}
		}

		realTime=realTime*60;
		
		var time = {
			stopId:global.C38.stops[l.StopId].otpId,
			stopName:global.otp.stops[global.C38.stops[l.StopId].otpId].name,
			scheduledArrival:realTime,
			scheduledDeparture:realTime,
			realtimeArrival:realTime,
			realtimeDeparture:realTime,
			arrivalDelay:0,
			departureDelay:0,
			timepoint:true,
			realtime:bRealTime,
			serviceDay:serviceDay.getTime()/1000,
			tripId:'C38:'+l.VehicleJourneyId
		};
		patterns[journeyId].times.push(time);
	};
	for (var pa in patterns) {
		res.push(patterns[pa]);
	}
	return res;
};

var load = function *(config) {
	try {
		var reqs = {
			stops:kRequest.get({url:urlC38+'/transport/v3/stop/GetStops/json?true=true'+keyC38, timeout: 50000,json: true}),
			routes:kRequest.get({url:urlC38+'/transport/v3/line/GetLines/json?OperatorIds=12&OnlyPublished=true'+keyC38, timeout: 50000,json: true}),
		};
		var res = yield reqs;
		parseStops(res.stops);
		parseRoutes(res.routes);
		otpHoraires.changeEtatServeur('C38',true);
		console.log('C38 Initialisé !');
	} catch(e){
		console.log('ECHEC de horairesC38.load code : '+err.code);
		exports.testC38();
	}
}
var parseStops = function(resp) {
	var nbPresents = 0;
	if(resp.body && resp.body.Data) {
		resp.body.Data.forEach(function (stop){
			if (stop.Operator.Code == 'CG38') {
				var code = 'C38:'+stop.Code;
				if(global.otp.stops[code]) {
					global.otp.stops[code].c38Id = stop.Id;
					global.C38.stops[stop.Id] = {arret:stop.Name,commune:stop.Locality.Name,otpId:code};
					nbPresents++;
				}
			}
		});
		console.log('C38 stops : '+nbPresents+' elements');
	} else {
		console.log('ECHEC de horairesC38.parseStops');
		exports.test();
		return false;
	}
	return true;
};

var parseRoutes = function(resp) {
	if(resp.body && resp.body.Data) {
		resp.body.Data.forEach(function (route){
			var code = 'C38:'+route.Number;
			if(global.otp.routes[code]) {
				global.C38.routes[route.Id]= route;
			}
		});
		console.log('C38 routes : '+Object.keys(global.C38.routes).length+' elements');
		return true;
	} else {
		console.log('ECHEC de horairesC38.parseRoutes');
		exports.test();
		return false;
	}
};
