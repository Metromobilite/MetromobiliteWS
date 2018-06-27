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
const Joi = require('koa-joi-router').Joi;
var main = require('./index');

global.alerts={};

exports.routes = [
	{
		method: 'get',
		path: '/api/gtfs-rt/alerts/:agencyId',
		handler: getGtfsRtAlerts,
		meta:{
			description:'Evenements de transport en commun au format GTFS-RT Alerts.'
		},
		groupName: 'Temps réel',
		cors:true,
		private:true,
		validate:{
			params:{
				agencyId:Joi.string().alphanum()
			}
		}
	}
]

exports.init = async function (config) {
	main.eventEmitter.on('updateDynData', function (evt) {
		if(evt.type=='evtTC') updateAlerts();
	});
}
exports.initDynamique = function() {
	updateAlerts();
}
async function getGtfsRtAlerts(ctx){
	try {
		var agencyId = ctx.request.params.agencyId;
		var FeedMessage = GtfsRealtimeBindings.FeedMessage;
		if(!global.alerts[agencyId]) {
			ctx.body = new FeedMessage ({
				header :{
					gtfs_realtime_version: "1.0",
					incrementality: 'FULL_DATASET',
					timestamp: Math.floor(new Date().getTime()/1000)
				},
				entity :[]
			}).toBuffer();
		} else {
			ctx.body =  global.alerts[agencyId];
		}
		
	} catch(e){
		main.dumpError(e,'getGtfsRtAlerts');
	}
}
function updateAlerts() {
	var FeedMessage = GtfsRealtimeBindings.FeedMessage;

	var contents = {};
	for(e in global.dyn['evtTC']){
		if (global.dyn['evtTC'][e].listeLigneArret) {
			var agency = global.dyn['evtTC'][e].listeLigneArret.split('_')[0];
			if(!contents[agency]){
				contents[agency] = {
					header :{
						gtfs_realtime_version: "1.0",
						incrementality: 'FULL_DATASET',
						timestamp: Math.floor(new Date().getTime()/1000)
					},
					entity :[]
				};
			}
			var tabTexte = global.dyn['evtTC'][e].texte.split('|');
			var route = global.dyn['evtTC'][e].listeLigneArret.replace('_',':');
			if (global.otp.routes[global.dyn['evtTC'][e].listeLigneArret.replace('_',':')])
				route = global.otp.routes[route].id;
			
			var date = global.dyn['evtTC'][e].dateDebut.split(' ')[0].split('/');
			var heure = global.dyn['evtTC'][e].dateDebut.split(' ')[1];
			var dateiso = date[2]+'-'+date[1]+'-'+date[0]+'T'+heure;
			var timeDeb = new Date(dateiso).getTime();
			
			var active_period={ start: Math.floor(timeDeb/1000) }

			if(global.dyn['evtTC'][e].dateFin != '31/12/2050 23:59') {
				date = global.dyn['evtTC'][e].dateFin.split(' ')[0].split('/');
				heure = global.dyn['evtTC'][e].dateFin.split(' ')[1];
				dateiso = date[2]+'-'+date[1]+'-'+date[0]+'T'+heure;
				var timeFin = new Date(dateiso).getTime();
				active_period.end = Math.floor(timeFin/1000);
			}
			contents[agency].entity.push({
				id: e,
				alert :{
					active_period :[active_period],
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
	for (var agency in contents) {
		if(!global.alerts[agency]){
			var alerts = new FeedMessage (contents[agency]);
			global.alerts[agency] =  alerts.toBuffer();
		}
	}

};
