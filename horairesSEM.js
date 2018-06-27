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
const Joi = require('koa-joi-router').Joi;
var axios = require('axios');

var main = require('./index');
var otpHoraires = require('./otpHoraires');

var urlSEM,keySEM;

exports.routes = [];

exports.init = async function (config) {
	try {
		urlSEM = config.plugins.otpHoraires.dependencies.horairesSEM.url;
		keySEM = config.plugins.otpHoraires.dependencies.horairesSEM.key;
		global.liaisonsServeurs['SEM'] = { libelle:'Cityway Tag', lifecycle:otpHoraires.NOT_INITIALIZED };
		global.etatsServeurs['SEM']=false;
		global.etatsServeurs['lastFailSEM']=false;
	
		main.eventEmitter.on('otpLoaded', async function (evt) {
			getStatique();
		});	
	} catch(e){
		main.dumpError(e,'horairesSEM.init');
	}
}

async function getStatique() {
	await exports.test();
}

exports.test = async function () {
	try {
		if(global.etatsServeurs.lastFailSEM && global.etatsServeurs.lastFailSEM + 60000 > new Date().getTime()) {
			return false;
		}

		var options = {method:'get', url:urlSEM+'/TimeTables/v1/GetNextStopHours/json?CalcMode=REALTIME&stopId=4193'+keySEM, timeout: 5000, responseType: 'json'};
		if(main.isDebug()) console.log(options.url);
		var res = await axios(options);
		if (res.status!=200 || res.statusText!='OK' || !res.data) {
			otpHoraires.changeEtatServeur('SEM',false);
			console.error('ECHEC de horairesSEM.test code : '+(resp.data?resp.status:'???'));
			console.error('Prochaine tentative : '+new Date(global.etatsServeurs.lastFailSEM+60000).toLocaleTimeString());
			return false;
		} else {
			if(global.etatsServeurs.SEM)
				return true;
			else {
				otpHoraires.changeEtatServeur('SEM',true);
				console.log('SEM Initialisé !');
				return true;
			}
		}
	} catch(e){
		otpHoraires.changeEtatServeur('SEM',false);
		console.error('ECHEC de horairesSEM.test');
		console.error('Prochaine tentative : '+new Date(global.etatsServeurs.lastFailSEM+60000).toLocaleTimeString());
		return false;
	}
}
exports.getOptions = function(idOtp) {
	//si on a pas de GTFS-RT SEM et que l'on connait l'arret
	if(!(global.etatsServeurs.SEMGTFSActif && global.etatsServeurs.SEMGTFS) && !!global.otp.stops[idOtp] && !!global.otp.stops[idOtp].id) {
		if(global.etatsServeurs.SEM)
			return {url:urlSEM+'/TimeTables/v1/GetNextStopHours/json?CalcMode=REALTIME'+keySEM+'&stopId='+global.otp.stops[idOtp].id.split(':')[1], timeout: 5000,responseType: 'json',method:'get'};
		else
			return false;
	} else
		return false;
}
exports.isMyResponse = function(resp){
	return (resp.Data.length>0 && resp.Data[0].StopPassingTimeList);
}
exports.parseResponse = function(resp){
	var res = [];
	var now = new Date();

	now.setHours(12,0,0,0);//midi
	now=new Date(now.getTime()-12*60*60*1000);
	var serviceDay = now;

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
			if(!global.otp.stops[code]) {
				console.error('horaireSEM.parseResponse : '+code+' inconnu !');
			}
			var time = {
				stopId:code,
				stopName:global.otp.stops[code].name,
				scheduledArrival:realTime,
				scheduledDeparture:(t.StopId==t.LastStopId?null:realTime),//pas d'horaire de départ au terminus,
				realtimeArrival:realTime,
				realtimeDeparture:(t.StopId==t.LastStopId?null:realTime),//pas d'horaire de départ au terminus,
				arrivalDelay:0,
				departureDelay:0,
				timepoint:true,
				realtime:(t.RealTime?true:false),
				serviceDay:serviceDay.getTime()/1000,
				tripId:t.VehicleJourneyId
			};
			patterns[t.JourneyPatternId].times.push(time);
			main.eventEmitter.emit('horairesSEMrequete',{time:time,line:line});
			
		}
		for (var k=0 ; k < l.JourneyPatternList.length ; k++) {
			var p = l.JourneyPatternList[k];
			patterns[p.JourneyPatternId].pattern.desc = p.Direction.Destination;
			patterns[p.JourneyPatternId].pattern.dir = p.Direction.Direction;
			patterns[p.JourneyPatternId].pattern.shortDesc = p.Direction.Destination.substring(0,15).toUpperCase();
		}

		for (var pa in patterns) {
			res.push(patterns[pa]);
		}
	};
	return res;
}