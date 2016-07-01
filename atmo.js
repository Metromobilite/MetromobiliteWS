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

//	module de gestion des données Atmo
//	indiceAtmo : vieux format
//	indiceAtmoFull : futur format en attente
//	indiceAtmoFake : vielles données dans futur format
//	si on met le parametre appMetromobilite sur le type indiceAtmoFull on retourne l'indiceAtmoFake a la place de l'indiceAtmoFull

var CronJob = require('cron').CronJob;
var request = require('request');
var main = require('./index');
var dyn = require('./dynWS');

main.eventEmitter.on('updateDynData', function (evt) {
	if (evt.type == 'indiceAtmo')
		indiceAtmoFullFake();
});

exports.initDynamique = function() {
	var jobAtmo = new CronJob({
		cronTime: '00 01 * * * *',//toutes les minutes
		runOnInit: true,
		onTick: exports.getDynamique,
		start: true,
		timeZone: "Europe/Paris"
	});
}

/**
 * charge les données atmo en mémoire
 */
exports.getDynamique = function () {
	var url = main.getConfig().plugins.atmo.atmoBassinData;
	request.get({url:url, timeout: 10000,json: true}, function(err,data) {
		if(!err && data.body) {
			var type = 'indiceAtmoFull';
			data.body.type = type;
			data.body.code = '1';
			if(data.body.date_modification!=null) 
				data.body.time = new Date(data.body.date_modification.date).getTime();
			else
				data.body.time = new Date().getTime();
			
			var atmoFull = {type: 'FeatureCollection', features: [{ properties:data.body }]};
			
			atmoFull.features[0].properties.indice_exposition = atmoFull.features[0].properties.indice_exposition_sensible;

			dyn.ajouterDyn(atmoFull);
			
		} else {
			console.log('ECHEC des données Atmo : '+err.code);
		}
	});
}
/**
 * override dynWS.getDyn function
 */
exports.getDyn = function (type,params) {
	if (type == 'indiceAtmoFull' && params.appMetromobilite == 'true')
		type = 'indiceAtmoFullFake';
	return (!global.dyn[type]) ? {} : global.dyn[type];
}
/**
 * data initialization for test mode
 * @param {Object} config
 */
exports.initTest = function (config) {
	
	var iTime = (new Date()).getTime();
	var oIndices = {
		"tr": ["INFORMATION NON DISPONIBLE","FLUIDE","RALENTI","EMBOUTEILLAGE / CONGESTION","FERMÉ"],
		"tc": ["INFORMATION NON DISPONIBLE","SERVICE NORMAL","SERVICE PERTURBÉ","SERVICE TRES PERTURBÉ","HORS SERVICE","HORS HORAIRE DE SERVICE"],
		"atmo": ["TRES BON","TRES BON","BON","BON","MOYEN","MÉDIOCRE","MÉDIOCRE","MAUVAIS","MAUVAIS","TRES MAUVAIS"]
	};
	var iAtmo = parseInt(Math.random() * (oIndices.atmo.length-1)+1);
	var iAtmoTomorow = parseInt(Math.random() * (oIndices.atmo.length-1)+1);
	var iTr = parseInt(Math.random() * oIndices.tr.length);
	var iTc = parseInt(Math.random() * oIndices.tc.length);	
	var o = { "features": [
				{ "properties": {"code": "1", "type": "indiceAtmo", "indice": iAtmo, "indiceJourLendemain": iAtmoTomorow, "time": iTime, "commentaire":"La qualité de l'air fut bonne et homogène sur l'ensemble de la région. Mardi 21 juin, l'ensoleillement encore restreint pour la saison permet de conserver une bonne qualité de l'air. Mercredi 22 juin, un net changement de conditions météorologiques s'opère. Des températures élevées et un ensoleillement important combinés aux émissions polluantes devraient être à l'origine d'une production d'ozone beaucoup plus accrue. La qualité de l'air devrait demeurer bonne à Chamonix et être moyenne à médiocre sur le reste de la région.", 
				"activation":"tata", 
				"action":"toto"}},
				{"properties": {"code": "IR1",  "type": "indiceTr", "indice": iTr}},
				{"properties": {"code": "ITC1",  "type": "indiceTc", "indice": iTc}}
			]};
	dyn.ajouterDyn(o);
}


/**
 * 
 */
function indiceAtmoFullFake() {
	if (!global.dyn['indiceAtmo']) return {};
	var atmo = global.dyn['indiceAtmo']["1"][global.dyn['indiceAtmo']["1"].length-1];
	var date = new Date(atmo.time).toISOString().substr(0,10);
	var dateLendemain = new Date(atmo.time+1000*60*60*24).toISOString().substr(0,10);
	
	var atmoFull = {
		"type":"indiceAtmoFullFake",
		"code":"ASC_1",
		"date":date,
		"date_modification":null,
		"dispositif_en_cours":(!!atmo.dispositif_en_cours?atmo.dispositif_en_cours:"Non disponible"),
		"polluant_majoritaire":"Non disponible",
		"indice_exposition":{},
		"activation": (!!atmo.activation?atmo.activation:"Non disponible"),
		"action": (!!atmo.action?atmo.action:"Non disponible"),
		"url_carte":main.getConfig().plugins.atmo.atmoImg + date.split('-')[0]+date.split('-')[1]+date.split('-')[2]+"_multi-polluant_reg.png",
		"commentaire":(!!atmo.commentaire?atmo.commentaire:"Non disponible"),
		"time":atmo.time};
	
	atmoFull.indice_exposition[date]={indice:atmo.indice,texte:getTexteIndice(atmo.indice)};
	atmoFull.indice_exposition[dateLendemain]={indice:atmo.indiceJourLendemain,texte:getTexteIndice(atmo.indice)};
	
	atmoFull = {type: 'FeatureCollection', features: [{ properties:atmoFull }]};
	
	dyn.ajouterDyn(atmoFull);
}
/**
 * 
 */
function getTexteIndice(indice, fake) {
	switch(indice) {
	case '1':
		texte='Très bon';
		break;
	case '2':
		texte='Très bon';
		break;
	case '3':
		texte='Bon';
		break;
	case '4':
		texte='Bon';
		break;
	case '5':
		texte='Moyen';
		break;
	case '6':
		texte='Médiocre';
		break;
	case '7':
		texte='Médiocre';
		break;
	case '8':
		texte='Mauvais';
		break;
	case '9':
		texte='Mauvais';
		break;
	case '10':
		texte='Très Mauvais';
		break;
	default:
		texte='Indisponible';
	}
	return texte;
}