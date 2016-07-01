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

// generation d'un flux GTFS-RT Alert a partir des données evenement reçues dans le module dynWs

var GtfsRealtimeBindings = require('gtfs-realtime-bindings');
var route = require('koa-route');
var kRequest = require('koa-request');
var querystring = require('querystring');
var main = require('./index');
var config;
global.alerts=null;

exports.updateAlerts = function() {
	var FeedMessage = GtfsRealtimeBindings.FeedMessage;
	var content = {
		header :{
			gtfs_realtime_version: "1.0",
			incrementality: 'FULL_DATASET',
			timestamp: Math.floor(new Date().getTime()/1000)
		},
		entity :[]
	};
	for(e in global.dyn['evtTC']){
		if (global.dyn['evtTC'][e].listeLigneArret) {
			var tabTexte = global.dyn['evtTC'][e].texte.split('|');
			var agency = global.dyn['evtTC'][e].listeLigneArret.split('_')[0];
			var route = global.dyn['evtTC'][e].listeLigneArret.replace('_',':');
			if (global.otp.routes[global.dyn['evtTC'][e].listeLigneArret.replace('_',':')])
				route = global.otp.routes[route].id;
			
			var date = global.dyn['evtTC'][e].dateDebut.split(' ')[0].split('/');
			var heure = global.dyn['evtTC'][e].dateDebut.split(' ')[1];
			var dateiso = date[2]+'-'+date[1]+'-'+date[0]+'T'+heure;
			var timeDeb = new Date(dateiso).getTime();
			
			date = global.dyn['evtTC'][e].dateFin.split(' ')[0].split('/');
			heure = global.dyn['evtTC'][e].dateFin.split(' ')[1];
			dateiso = date[2]+'-'+date[1]+'-'+date[0]+'T'+heure;
			var timeFin = new Date(dateiso).getTime();
			
			content.entity.push({
				id: e,
				alert :{
					active_period :[{ start: Math.floor(timeDeb/1000), end: Math.floor(timeFin/1000) }],
					informed_entity :[{ agency_id: agency, route_id: route.split(':')[1], route_type: null, trip: null, stop_id: null
					}],
					//cause: 1,
					//effect:8,
					url: {
						translation: [{
							text: "http://www.metromobilite.fr/index.html?page=Evts#"+global.dyn['evtTC'][e].listeLigneArret,
						}]
					},
					header_text: {
						translation: [{
							text: tabTexte[0],
						}]
					},
					description_text: {
						translation: [{
							text: tabTexte.slice(1).join('\n'),
						}]
					}
				}
			});
		}
	}
	var alerts = new FeedMessage (content);
	global.alerts = alerts.toBuffer();
};

exports.initKoa = function (mainApp,mainRoute) {
	global.alerts=exports.updateAlerts();
	mainApp.use(route.get('/api/gtfs-rt/alerts', function *() {
		try {
			this.body =  global.alerts;
		} catch(e){
			main.dumpError(e);
		}
	}));
}
