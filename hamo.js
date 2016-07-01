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

// module pour la mise a disposition des données statiques/dynamiques des voitures electriques en autopartage citelib by HaMo

var CronJob = require('cron').CronJob;
var request = require('request');
var kRequest = require('koa-request');
var co = require('co');
var dyn = require('./dynWs');
var main = require('./index');

exports.type='hamo';

exports.init = function *() {
	//co(function *(){
		var config = main.getConfig();
		var url = config.plugins.hamo.hamoList;
		
		var resp = yield kRequest.get({url:url,timeout: 50000/*,json: true*/});
		resp.body = JSON.parse(resp.body);
		if(resp.body && resp.body.zone && resp.body.zone.areas.length > 0 && resp.body.zone.areas[0].area_name == 'Grenoble') {

			resp.body.zone.areas[0].stations.forEach(function (s,index) {
				var f = {
					type: 'Feature',
					properties: {
						CODE: 'E'+s.station_id,
						LIBELLE: s.station_name,
						type: exports.type,
						id: 'E'+s.station_id
					},
					geometry: {
						type: 'Point',
						coordinates: [s.station_lng,s.station_lat]
					}
				};
				global.poi.features.push(f);
				//TODO enlever quand on a migré site et app vers hamo
				var f2 = {
					type: 'Feature',
					properties: {
						CODE: 'E'+s.station_id,
						LIBELLE: s.station_name,
						type: 'omms',
						id: 'E'+s.station_id
					},
					geometry: {
						type: 'Point',
						coordinates: [s.station_lng,s.station_lat]
					}
				};
				global.poi.features.push(f2);
			});
			if (!config.types[exports.type]) config.types[exports.type]={"find":"LIBELLE"};
			//TODO enlever quand on a migré site et app vers hamo
			if (!config.types['omms']) config.types['omms']={"find":"LIBELLE"};
			
			console.log(exports.type+' loaded, total : '+resp.body.zone.areas[0].stations.length+' elements (+'+global.poi.features.length+')');

		} else {
			console.log('ECHEC du statique Ha:Mo');
		}

	//}).catch(main.dumpError);
	return false;
}

exports.initDynamique = function() {
	var jobHamo = new CronJob({
		cronTime: '00 */6 * * * *',//tous les 6 minutes
		onTick: exports.getDynamique,
		runOnInit:true,
		start: true,
		timeZone: "Europe/Paris"
	});
}
exports.getDynamique = function() {
	co(function *(){
		var features = {};
		var tasks = [];
		var tasksRes = [];
		var config = main.getConfig();

		var resAvailableCOMS = yield kRequest.get({url:config.plugins.hamo.hamoComsAvail, timeout: 5000/*,json: true*/});
		var resAvailableIRoad = yield kRequest.get({url:config.plugins.hamo.hamoIRoadAvail, timeout: 5000/*,json: true*/});

		resAvailableCOMS.body = JSON.parse(resAvailableCOMS.body);
		resAvailableCOMS.body.available_stations.forEach(function (s,index) {
			if(!features[s.station_id]) features[s.station_id]={properties:{type:exports.type,code:'E'+s.station_id,time:new Date().getTime()}};
			features[s.station_id].properties.comsAvailable=s.available_service;
		});
		resAvailableIRoad.body = JSON.parse(resAvailableIRoad.body);
		resAvailableIRoad.body.available_stations.forEach(function (s,index) {
			if(!features[s.station_id]) features[s.station_id]={properties:{type:exports.type,code:'E'+s.station_id}};
			features[s.station_id].properties.iRoadAvailable=s.available_service;
		});
		var r = {type: 'FeatureCollection', features:[] };
		for(var f in features){
			var url = config.plugins.hamo.hamoDynDetail;
			var res = yield kRequest.get({url:url+f, timeout: 50000/*,json: true*/});
			res.body = JSON.parse(res.body);
			features[f].properties.parking_space_free=res.body.station.parking_space_free;
			features[f].properties.available_car=res.body.station.available_car;
			r.features.push(features[f]);
		}
		dyn.ajouterDyn(r,true);

	}).catch(main.dumpError);
	return false;
}
