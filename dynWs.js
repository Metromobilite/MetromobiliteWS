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

// module destiné a recuperer les données temps réel et a les transformer

var app = require('koa')();
var route = require('koa-route');
var cors = require('koa-cors');
var request = require('request');
var parse = require('co-body');
var querystring = require('querystring');
var getRawBody = require('raw-body');
var rt = require('./rtWs');
var main = require('./index');
var gtfsRt = require('./gtfsRtWs');

global.dyn={};
global.dynCam={};
global.dyn['status'] = {};

var options = {
	origin: true,
	methods: 'GET,HEAD,PUT,POST,DELETE'
}

app.use(cors(options));

exports.init = function *(config) {
	app.listen(config.portDyn, function() {
		console.log('Listening on http://localhost:'+config.portDyn);
	});
	if(!rt.init(config)){}

	for(var p in config.plugins) {
		if(global.plugins.name[p].initDynamique) global.plugins.name[p].initDynamique();
	}
};

exports.initKoa = function (mainApp,mainRoute) {
	// http://data.metromobilite.fr/api/dyn/:type/json
	mainApp.use(mainRoute.get('/api/dyn/:type/json', function *(type) {
		try{
			var params = querystring.parse(this.querystring);
			if (type=='omms') type='hamo';
			this.body = getDyn(type,params);
		} catch(e){
			main.dumpError(e,'/api/dyn/'+type+'/json');
		}
	}));
	gtfsRt.initKoa(mainApp,mainRoute);
}

app.use(function* (next) {
  try{
	if (this.request.header['content-type'] == 'application/json') {
		this.request.body = yield parse.json(this);
	} else {
		var string = yield getRawBody(this.req, {//recuperation du flux mp4
				length: this.length,
				limit: '1mb'
		});
		
		this.request.body =string;
	  } 
	  
	  yield next;
	  
	} catch(e){
		main.dumpError(e,'dynWS app.use(function* (next)');
	}
});

app.use(route.post('/update', function *() {
	try{
		this.response.body = ajouterDyn(this.request.body);
	} catch(e){
		main.dumpError(e,'/update');
	}
}));

app.use(route.post('/updateEvt', function *() {
	try{
		
		this.response.body = refreshEvt(this.request.body);
	} catch(e){
		main.dumpError(e,'/updateEvt');
	}
}));

app.use(route.post('/updateCamera', function *() {
	try{
		this.response.body = refreshCamera(this.request.body, this.request.header);
	} catch(e){
		main.dumpError(e,'/updateCamera');
	}
}));

// all other routes
app.use(function *() {
	this.body = 'Oups !';
});

function refreshEvt(json) {
	var type = 'evt';
	global.dyn[type] = json;
	main.eventEmitter.emit('updateDynData',{type:type,data:global.dyn[type]});
	var dynEvtTR = {};
	var dynEvtTC = {};
	for (e in json) {
		if(json[e].listeLigneArret) 
			dynEvtTC[e]=json[e];
		else
			dynEvtTR[e]=json[e];
	}
	type='evtTC';
	global.dyn[type]=dynEvtTC;
	main.eventEmitter.emit('updateDynData',{type:type,data:global.dyn[type]});
	type='evtTR';
	global.dyn[type]=dynEvtTR;
	main.eventEmitter.emit('updateDynData',{type:type,data:global.dyn[type]});
	
	gtfsRt.updateAlerts();
	return true;
};

function refreshCamera(data,header) {
	global.dynCam[header['name']] = { time: header['time'], video: data};
	if(main.isDebug()) {
		var fs = require('fs');
		fs.writeFile(header['name'], data, function(err) {
		if(err) {
			return console.log(err);
		}});
	}
	return true;
};
exports.ajouterDyn = function(json,purge) {
	return ajouterDyn(json,purge);
}
function ajouterDyn(json,purge) {
	
	var config = main.getConfig();
	
	if(typeof(purge)=='undefined') purge=false;
	if(json.features) {
		var types = {};
		
		var codesPresents = {};
		json.features.forEach(function (feature,index){
			var type = ''+(feature.properties.type?feature.properties.type:feature.properties.TYPE);
			types[type]=true;
			if (!codesPresents[type]) codesPresents[type]={}
			delete feature.properties.type;
			if(!feature.properties.code) {
				console.log('ajouterDyn : missing code !');
				return false;
			} else if (feature.properties.time == -1 || feature.properties.time == -1000){
				return false;
			} else {
				var code = ''+feature.properties.code;
				codesPresents[type][code]=true;
				delete feature.properties.code;
				if(!global.dyn[type]) {
					global.dyn[type] = {};
					console.log('Réception de données dynamiques : '+type);
				}
				if(!global.dyn[type][code]) global.dyn[type][code] = [];
				if (type == 'indiceTc' || type == 'indiceTr') {
					feature.properties.time = new Date().getTime();
				}
				var lastTime = 0;
				if(global.dyn[type][code].length>0) lastTime = global.dyn[type][code][global.dyn[type][code].length-1].time;
				if (feature.properties.time > lastTime){
					if(!global.dyn['status'][type]) global.dyn['status'][type] = {};
					var partenaire;
					if (type =='hamo') partenaire = 'HAM';
					else partenaire = code.substr(0,3);
					if(type != 'indiceTc' && type != 'indiceTr' && type != 'trr') global.dyn['status'][type][partenaire]=feature.properties.time;
					
					global.dyn[type][code].push(feature.properties);
					delete global.dyn[type][code][global.dyn[type][code].length-1].code;
					if(global.dyn[type][code].length>parseInt(config.max_keep_dyn) || (purge && global.dyn[type][code].length>1) ) {
						global.dyn[type][code].shift();
					}
				} else {
					//on recale l'heure car le nsv est toujours d'actualite
					if (type == 'trr' || type == 'ligne' || type == 'indiceTc' || type == 'indiceTr') {
						if(global.dyn[type][code].length>0) global.dyn[type][code][global.dyn[type][code].length-1].time = new Date().getTime();
					}
				}
			}
		});
		for(var type in types) {
			// on purge les trop vieux
			for(var code in global.dyn[type]) {
				var lastTime = 0;
				if(global.dyn[type][code].length>0) lastTime = global.dyn[type][code][global.dyn[type][code].length-1].time;
				var now = new Date().getTime();
				// trop vieux
				if (type != 'indiceTc' && type != 'indiceTr' && !codesPresents[type][code] && lastTime < (now - 24*60*1000)) {
					delete global.dyn[type][code];
				}
				//on prolonge pour les indices
				if (!codesPresents[type][code] && lastTime > (now - 24*60*1000) && (type == 'indiceTc' || type == 'indiceTr')) {
					global.dyn[type][code][global.dyn[type][code].length-1].time = new Date().getTime();
				}
			}
			main.eventEmitter.emit('updateDynData',{type:type,data:global.dyn[type]});
			main.eventEmitter.emit('updateDynData',{type:'status',data:global.dyn['status']});
		}
		return true;
	} else {
		console.log('ajouterDyn : no features !');
		return false;
	}
}
function getDyn(type,params) {
	if (!!global.plugins.types[type] && !!global.plugins.types[type].getDyn) {
		return global.plugins.types[type].getDyn(type,params);
	}
	return (!global.dyn[type]) ? {} : global.dyn[type];
}

exports.initTest = function (config) {	

	console.log('---Test mode : Création des évènements');

	var iTime = (new Date()).getTime();
	var oEvts = JSON.parse('{'	
	+ '"SEM_3100":{"type":"restriction_ltc","id":"34677","dateDebut":"24/02/2015 05:20","dateFin":"31/12/2050 23:59","heureDebut":"00:00:00","heureFin":"00:00:00","latitude":"-1","longitude":"-1","weekEnd":"2","listeLigneArret":"SEM_48","texte":"48 : Travaux secteur Claix Mairie|Du 24/02/2015 05:20|Jusqu\'à une date indéterminée|  La ligne est déviée, en direction de Pont Rouge, entre les arrêts Furonnières et Les Fayards.|Arrêt(s) non desservi(s): Claix Mairie (->Pont Rouge)."},'
	+ '"GAM_EVT_40097":{"type":"chantier","id":"40097","dateDebut":"06/10/2015 08:00","dateFin":"31/12/2050 23:59","heureDebut":"00:00:00","heureFin":"00:00:00","latitude":"45.242","longitude":"5.82412","weekEnd":"2","listeLigneArret":"","texte":"CHANTIER: Route de Chambéry|Du 06/10/2015 08:00|Au 30/06/2016 17:00|Travaux divers dans St-Ismier. Circulation alternée."},'
	+ '"GAM_EVT_42768":{"type":"restriction","id":"42768","dateDebut":"24/02/2016 16:32","dateFin":"31/12/2050 23:59","heureDebut":"00:00:00","heureFin":"00:00:00","latitude":"45.1679","longitude":"5.70389","weekEnd":"2","listeLigneArret":"","texte":"RESTRICTION: bretelle d\'accès|Du 24/02/2016 16:32|Jusqu\'à une date indéterminée|A480 : échangeur no 4 Lesdiguières, la bretelle d\'accès à l\'A480 depuis Grenoble est fermée à la circulation. Consulter le communiqué de presse de la DIR-CE  du 9 juin 2016 : https://huit.re/P-Kq-gX0"}'
	+ '}');	
	
	refreshEvt(oEvts);	
};
