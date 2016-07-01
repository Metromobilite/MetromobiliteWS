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

// dependence du module otpHoraires pour les données temps reel du reseau urbain (reseau primaire)
var kRequest = require('koa-request');

var main = require('./index');
var otpHoraires = require('./otpHoraires');

var urlSEM,keySEM;

exports.getStatique = function *() {
	var config = main.getConfig();
	urlSEM = config.plugins.otpHoraires.dependencies.horairesSEM.url;
	keySEM = config.plugins.otpHoraires.dependencies.horairesSEM.key;
	global.etatsServeurs['SEM']=false;
	global.etatsServeurs['lastFailSEM']=false;
	yield exports.test();
}
exports.initKoa = function (app,route) {
	app.use(route.get('/api/gtfs-rt/SEM/trip-update', function *() {
		try {
			var url = main.getConfig().plugins.otpHoraires.dependencies.horairesSEM.tripUpdate;
			var options = {url:url, timeout: 5000,encoding: null};
			var res = yield kRequest.get(options);
			this.body = res.body;
		} catch(e){
			main.dumpError(e);
		}
	}));
}
exports.test = function *() {
	try {
		if(global.etatsServeurs.lastFailSEM && global.etatsServeurs.lastFailSEM + 60000 > new Date().getTime()) {
			return false;
		}
		var resp = yield kRequest.get({url:urlSEM+'/transport/v2/GetLocalities/json?true=true'+keySEM, timeout: 2000,json: true});
		if(!!resp.body && resp.body.StatusCode == 200) {
			if(global.etatsServeurs.SEM) 
				return true;
			else {
				otpHoraires.changeEtatServeur('SEM',true);
				console.log('SEM Initialisé !');
				return true;
			}
		} else {
			otpHoraires.changeEtatServeur('SEM',false);
			console.log('ECHEC de horairesSEM.test code : '+(resp.body?resp.body.StatusCode:'???'));
			console.log('Prochaine tentative : '+new Date(global.etatsServeurs.lastFailSEM+60000).toLocaleTimeString());
			return false;
		}
	} catch(e){
		otpHoraires.changeEtatServeur('SEM',false);
		console.log('ECHEC de horairesSEM.test');
		console.log('Prochaine tentative : '+new Date(global.etatsServeurs.lastFailSEM+60000).toLocaleTimeString());
		return false;
	}
};
exports.getOptions = function(idOtp) {
	if(!!global.otp.stops[idOtp] && !!global.otp.stops[idOtp].id) {
		return {url:urlSEM+'/TimeTables/v1/GetNextStopHours/json?CalcMode=REALTIME'+keySEM+'&stopId='+global.otp.stops[idOtp].id.split(':')[1], timeout: 5000,json: true};
	} else 
		return false;
}
exports.isMyResponse = function(resp){
	return (resp.Data.length>0 && resp.Data[0].StopPassingTimeList);
}
exports.parseResponse = function(resp){
	var res = [];
	var now = new Date();
	//var bPostMidnight = (now.getHours()< 3);
	now.setHours(12,0,0,0);//midi
	//-12h pour le jours de changement d'heure
	now=new Date(now.getTime()-12*60*60*1000);
	var serviceDay = now;
	//if(bPostMidnight) {serviceDay.setHours(-24)};

	for (var i=0 ; i < resp.Data.length ; i++) {
		var l = resp.Data[i];
		var line = 'SEM:'+l.Line.Number;
		var patterns = {};
		for (var j=0 ; j < l.StopPassingTimeList.length ; j++) {
			var t = l.StopPassingTimeList[j];
			if (!patterns[t.JourneyPatternId]) {
				patterns[t.JourneyPatternId] = { 
					pattern : {
						id : line+':'+t.JourneyPatternId,
						desc : '',
						dir : '',
						shortDesc : ''
					},
					times :[]
				};
			}
			
			var realTime = (t.RealTime?t.RealTime:t.PassingTime)*60;
			var code = 'SEM:'+l.StopPoint.ImportId.replace(/[a-zA-Z]/g ,"");
			var time = {
				stopId:code,
				stopName:global.otp.stops[code].name,
				scheduledArrival:realTime,
				scheduledDeparture:realTime,
				realtimeArrival:realTime,
				realtimeDeparture:realTime,
				arrivalDelay:0,
				departureDelay:0,
				timepoint:true,
				realtime:(t.RealTime?true:false),
				serviceDay:serviceDay.getTime()/1000,
				tripId:""
			};
			patterns[t.JourneyPatternId].times.push(time);
		}
		for (var k=0 ; k < l.JourneyPatternList.length ; k++) {
			var p = l.JourneyPatternList[k];
			patterns[p.JourneyPatternId].pattern.desc = p.Direction.Destination;
			patterns[p.JourneyPatternId].pattern.dir = p.Direction.Direction;
			patterns[p.JourneyPatternId].pattern.shortDesc = p.Direction.Destination.substring(0,15);
		}

		for (var pa in patterns) {
			res.push(patterns[pa]);
		}
	};
	return res;
};