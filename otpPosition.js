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

// module de calcul approximatif de la position du bus a partir de son tracé et du temps d'approche prevu
const Joi = require('koa-joi-router').Joi;
var axios = require('axios');
var querystring = require('querystring');
var fs = require('fs');
var turf = require('@turf/turf');
var polyline = require('./polyline');
var main = require('./index');

exports.routes = [
	{
		method: 'get',
		path: '/api/routers/:router/index/trips/:tripId/position',
		handler: getCurrentPos,
		meta:{
			description:'La position du vehicule a l\'instant donné.'
		},
		groupName: 'Temps réel',
		cors:true,
		private:true,
		validate:{
			params:{
				router:Joi.string(),
				tripId:Joi.string()
			}
		}
	}
];

exports.test = async function () {
	return true;
}
exports.isMyResponse = function(resp){
	return false;
}
// * http://data.metromobilite.fr/api/routers/default/index/trips/SEM:894621/position
async function getCurrentPos(ctx) {
	try {
		var tripId = ctx.request.params.tripId;
		var urlOtp = main.getConfig().plugins.otpHoraires.url;
		var currentPos = {
			message:'',
			prevStop:'',
			nextStop:'',
			timeAfterPrev:'',
			diffPrevNext:'',
			pos:'',
			shape:''
		};	
		const tripTimesPromise = axios({method:'get', url:urlOtp+'/routers/default/index/trips/'+tripId+'/stoptimes', timeout: 10000, responseType: 'json'});
		const tripShapePromise = axios({method:'get', url:urlOtp+'/routers/default/index/trips/'+tripId+'/geometry', timeout: 10000, responseType: 'json'});

		const [tripTimesRes,tripShapeRes] = await axios.all([tripTimesPromise,tripShapePromise]);

		if (tripTimesRes.status!=200 || tripTimesRes.statusText!='OK' || !tripTimesRes.data) {
			console.error("otpPosition : Erreur tripTimes : " + tripTimesRes.status + " Message : " + tripTimesRes.statusText);
			currentPos.message = 'Erreur serveur.';
			ctx.body = currentPos;
			return;
		} else if (tripShapeRes.status!=200 || tripShapeRes.statusText!='OK' || !tripShapeRes.data) {
			console.error("otpPosition : Erreur tripShape : " + tripShapeRes.status + " Message : " + tripShapeRes.statusText);
			currentPos.message = 'Erreur serveur.';
			ctx.body = currentPos;
			return;
		}
		var tripTimes = tripTimesRes.data;
		var tripShape = tripShapeRes.data;

		var now = new Date();
		now.setHours(12,0,0,0);//midi
		//-12h pour le jours de changement d'heure
		now=new Date(now.getTime()-12*60*60*1000);
		var serviceDay = now;
		var currentTime = Math.floor((new Date().getTime() - serviceDay.getTime()) / 1000);

		//la course n'as pas commencée
		if(tripTimes.length > 0 && currentTime < tripTimes[0].realtimeDeparture) {
			currentPos.message = 'La course n\'a pas commencé';
			ctx.body = currentPos;
			return;
		}
		//la course est déja terminée
		if(tripTimes.length > 0 && currentTime >= tripTimes[tripTimes.length-1].realtimeDeparture) {
			currentPos.message = 'La course est déja terminée';
			ctx.body = currentPos;
			return;
		}
		currentPos.stops = [];
		tripTimes.forEach(function (f,index){
			if(index < tripTimes.length-1 && f.realtimeDeparture <= currentTime && tripTimes[index+1].realtimeDeparture >= currentTime) {
				currentPos.prevStop = JSON.parse( JSON.stringify( global.otp.stops[global.otp.idStops[f.stopId]] ));
				currentPos.nextStop = JSON.parse( JSON.stringify( global.otp.stops[global.otp.idStops[tripTimes[index+1].stopId]] ));
				currentPos.timeAfterPrev = currentTime - f.realtimeDeparture;
				currentPos.diffPrevNext = tripTimes[index+1].realtimeDeparture - f.realtimeDeparture;
			}
			
			currentPos.stops.push(JSON.parse( JSON.stringify(global.otp.stops[global.otp.idStops[f.stopId]])));
		});
		currentPos.times=tripTimes;
		// position
		var shapeJson = { type: 'Feature', properties: {}, geometry: polyline.toGeoJSON(tripShape.points,5) } ;
		var prev = turf.point([parseFloat(currentPos.prevStop.lon),parseFloat(currentPos.prevStop.lat)]);
		var next = turf.point([parseFloat(currentPos.nextStop.lon),parseFloat(currentPos.nextStop.lat)]);
		
		var prevNextLine = turf.lineSlice(prev,next,shapeJson);
		var prevNextDist = turf.lineDistance(prevNextLine,'kilometers');
		var prevCurrentPosDist = prevNextDist * currentPos.timeAfterPrev / currentPos.diffPrevNext;
		var pos = turf.along(prevNextLine, prevCurrentPosDist, 'kilometers');
		currentPos.pos = pos.geometry.coordinates;
		
		//var firstStop = global.otp.stops[global.otp.idStops[tripTimes[0].stopId]];
		//var firstPos = turf.point([parseFloat(firstStop.lon),parseFloat(firstStop.lat)]);
		//var shape = turf.lineSlice(firstPos,pos,shapeJson);
		//currentPos.shape = polyline.fromGeoJSON(shape,5);
		currentPos.shape = polyline.fromGeoJSON(shapeJson,5);
		
		ctx.body = currentPos;
	} catch(e) {
		main.dumpError(e,'otpPosition.getCurrentPos');
	}
}
