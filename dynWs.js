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

var Koa = require('koa');
var cors = require('@koa/cors');
const router = require('koa-joi-router');
const Joi = router.Joi;
const dynRouter = router();

var parse = require('co-body');
var querystring = require('querystring');
var getRawBody = require('raw-body');
var rt = require('./rtWs');
var main = require('./index');
//var gtfsRt = require('./gtfsRtWs');

const NOT_INITIALIZED = 'Not Initialized';
exports.NOT_INITIALIZED = NOT_INITIALIZED;
global.ref={
	'PAR':{type: "FeatureCollection", features: []},
	'PKG':{type: "FeatureCollection", features: []},
	'PMV':{type: "FeatureCollection", features: []},
	'PME':{type: "FeatureCollection", features: []},
	'trr':{type: "FeatureCollection", features: []},
	'ligne':{type: "FeatureCollection", features: []},
	'CAM':{type: "FeatureCollection", features: []},
	'vh':{type: "FeatureCollection", features: []}
};// type associés a des données dynamiques(PAR/PKG/PMV/PME/trr/ligne/vh/CAM)
global.refTime={
	'PAR':NOT_INITIALIZED,
	'PKG':NOT_INITIALIZED,
	'PMV':NOT_INITIALIZED,
	'PME':NOT_INITIALIZED,
	'trr':NOT_INITIALIZED,
	'ligne':NOT_INITIALIZED,
	'CAM':NOT_INITIALIZED,
	'vh':NOT_INITIALIZED
}
global.dyn={};
global.dynCam={};

global.dynIconMeteo={};
global.dynEvtTrGeojson={type: "FeatureCollection", features: []};


exports.routes = [
	{
		method: 'get',
		path: '/api/dyn/:type/json',
		handler: getDyn,
		meta:{
			description:'Données temps reel du type choisi type.'
		},
		groupName: 'Temps réel',
		cors:true,
		validate:{
			params:{
				type:Joi.string().alphanum(),
				key:Joi.number()
			}
		}
	},
	{
		method: 'get',
		path: '/api/dyn/evtTR/geojson',
		handler: getDynEvtTr,
		meta:{
			description:'Evenements routiers au format geojson.'
		},
		groupName: 'Temps réel',
		cors:true
	}
]
exports.dynRoutes = [
	{
		method: 'post',
		path: '/update/ref/:type',
		handler: postRef,
		meta:{
			description:'Réception des données temps Réel.'
		},
		groupName: 'Données entrantes',
		validate:{
			type:'json',
			maxBody: '2000kb',
			params:{
				type:Joi.string().alphanum()
			}
		}
	},
	{
		method: 'post',
		path: '/update/:type',
		handler: postDyn,
		meta:{
			description:'Réception des données de référence liées au temps Réel.'
		},
		groupName: 'Données entrantes',
		validate:{
			type:'json',
			params:{
				type:Joi.string().alphanum()
			}
		}
	},
	{
		method: 'post',
		path: '/updateCamera',
		handler: postCam,
		meta:{
			description:'Réception des vidéos des cameras.'
		},
		groupName: 'Données entrantes'
	},
];
exports.init = async function (config) {
	initKoaDyn(config);

	if(!rt.init(config)){}

	for(var p in config.plugins) {
		if(!global.plugins.name[p]) console.error('Impossible d\'inititaliser les données dynamiques de '+p);
		if(!!global.plugins.name[p].initDynamique) global.plugins.name[p].initDynamique();
	}
};
function initKoaDyn(config){
	var app = new Koa();
	var options = {
		allowMethods: 'GET,HEAD,PUT,POST,DELETE'
	}
	app.use(cors(options));
	app.use(async (ctx, next) => {
		try{
			/*if (ctx.request.header['content-type'] == 'application/json') {
				ctx.request.body = await parse.json(ctx,{ limit: '2mb' });
			} else {
				var string = await getRawBody(ctx.req, {//recuperation du flux mp4
					length: ctx.length,
					limit: '1mb'
				});
				ctx.request.body =string;
			}*/
			await next();
		} catch(e){
			console.error(ctx.request.path);
			main.dumpError(e,'dynWS app.use(async (ctx, next)');
		}
	});
	app.on('error', function(err, ctx){
		console.error('server error', err, ctx);
  	});
	dynRouter.route(exports.dynRoutes);

	app.use(dynRouter.middleware());

	app.listen(config.portDyn, function() {
		console.log('Listening on http://localhost:'+config.portDyn);
	});
	
	// all other routes
	app.use(async ctx => {
		ctx.body = 'Oups !';
	});
}
function refreshEvt(json) {
	var type = 'evt';
	global.dyn[type] = json;
	main.eventEmitter.emit('updateDynData',{type:type,data:global.dyn[type]});
	var dynEvtTR = {};
	var dynEvtTC = {};
	var dynEvtTrGeojson = {type: "FeatureCollection", features: []};
	for (e in json) {
		if(json[e].listeLigneArret) 
			dynEvtTC[e]=json[e];
		else {
			dynEvtTR[e]=json[e];
			var dateDebTab = json[e].dateDebut.split('/');
			var dateFinTab = json[e].dateFin.split('/');
			
			dynEvtTrGeojson.features.push({
				type: "Feature",
				properties: {
					text:json[e].texte,
					startDate:new Date(dateDebTab.reverse().join('-')).getTime(),
					endDate:new Date(dateFinTab.reverse().join('-')).getTime(),
					id:json[e].id,
					code:e,
					type:json[e].type,
					startHour:json[e].heureDebut,
					endHour:json[e].heureFin,
					weekEnd:json[e].weekEnd,
				},
				geometry: { type: "Point", coordinates: [parseFloat(json[e].longitude),parseFloat(json[e].latitude)] }
			});
		}
		
	}
	type='evtTC';
	global.dyn[type]=dynEvtTC;
	main.eventEmitter.emit('updateDynData',{type:type,data:global.dyn[type]});
	type='evtTR';
	global.dyn[type]=dynEvtTR;
	main.eventEmitter.emit('updateDynData',{type:type,data:global.dyn[type]});
	global.dynEvtTrGeojson=dynEvtTrGeojson;
	return { status:200 , etatsServeurs:global.etatsServeurs};
};

function refreshCamera(data,header) {
	global.dynCam[header['name']] = { time: header['time'], video: data};
	if(main.isDebug()) {
		var fs = require('fs');
		fs.writeFile(header['name'], data, function(err) {
		if(err) {
			console.log(err);
			return err;
		}});
	}
	var res = { status:200 };
	if(!!global.ref['CAM'] && global.refTime['CAM']==NOT_INITIALIZED) res.action = 'SEND_REF';
	return res;	
};
async function postRef(ctx){
	try{
		var type = ctx.request.params.type;
		ctx.request.body.features.forEach(function (feature,index){
			feature.properties.type=type;
			if(!feature.properties.id) feature.properties.id=feature.properties.CODE;
		});
		global.ref[type] = ctx.request.body;
		global.refTime[type] = new Date().getTime();
		if (!!global.plugins.types[type] && !!global.plugins.types[type].initRef) {
			global.plugins.types[type].initRef(type);
		}
		ctx.response.body = { status : 200 };

	} catch(e){
		main.dumpError(e,'dynWs.postRef');
	}
}
async function postDyn(ctx){
	try{
		var type = ctx.request.params.type;
		if(type=='evt') 
			ctx.response.body = refreshEvt(ctx.request.body);
		else
			ctx.response.body = ajouterType(type,ctx.request.body);
	} catch(e){
		main.dumpError(e,'dynWs.postDyn');
	}
}
async function postCam(ctx){
	try{
		var string = await getRawBody(ctx.req, {//recuperation du flux mp4
			length: ctx.length,
			limit: '1mb'
		});
		ctx.request.body =string;

		ctx.response.body = refreshCamera(ctx.request.body, ctx.request.header);
		ctx.response.set('Content-Type','application/json');
	} catch(e){
		main.dumpError(e,'dynWs.postCam');
	}
}

// http://data.metromobilite.fr/api/dyn/:type/json
async function getDyn(ctx) {
	try{
		var type = ctx.request.params.type;
		/*var params = querystring.parse(ctx.querystring);
		if (!!global.plugins.types[type] && !!global.plugins.types[type].getDyn) {
			ctx.body = global.plugins.types[type].getDyn(type,params);
		} else {*/
			ctx.body = (typeof(global.dyn[type]) === 'undefined' ) ? {} : global.dyn[type];
		//}
	} catch(e){
		main.dumpError(e,'dynWs.getDyn');
	}
}
// http://data.metromobilite.fr/api/dyn/evtTR/geojson
async function getDynEvtTr(ctx){
	try{
		ctx.body = global.dynEvtTrGeojson;
	} catch(e){
		main.dumpError(e,'dynWs.getDynEvtTr');
	}
}

exports.ajouterType = function(type,json) {
	return ajouterType(type,json);
}
// reponses possibles :
// action:'SEND_REF' envoyer les données de references associées au type
function ajouterType(type,json) {
	var config = main.getConfig();
	if(!global.dyn[type]) {
		console.log('Réception de données dynamiques : '+type);
	}
	global.dyn[type]=json;

	main.eventEmitter.emit('updateDynData',{type:type,data:global.dyn[type]});

	var res = { status:200 , etatsServeurs:global.etatsServeurs};
	if(!!global.ref[type] && global.refTime[type]==NOT_INITIALIZED) res.action = 'SEND_REF';
	return res;
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
