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

// module pour fournir des données ponctuelles chargées au format geojson
// la liste se trouve dans la section data de la configuration
// {
//		"type":"type affecté a la donnée dans l'API",
//		"file":"fichier",
//		"find":"champ properties dans lequel on fait les recherches texte",
//		"keep":{ 	garder uniquement les enregistrements dont le champ "key" contient la valeur "value"
//			"key":"TYPE",
//			"value":"PAR"
//		}
//	}
// ce module contient des cas particuliers liés au module otpHoraires : 'pointArret' => les poteaux et 'arret' => les zones d'arret
// le module findWs contient les recherches associées a ces données

var main = require('./index');
var fs = require('fs');
var querystring = require('querystring');
var dyn = require('./dynWs');

global.zones={};
global.zonesOTP={};
global.poteaux={};
global.findText={"type": "FeatureCollection", "features": []};
global.poi={"type": "FeatureCollection", "features": []};
var findTypes = ['rue','lieux','arret'];

exports.init = function *(config) {
	if( typeof(config.data)=='undefined') throw 'no data field in config.json';
	
	config.data.forEach(function (file,index){
		try {
			if( typeof(file.type)=='undefined') throw {message :'no field : "type" in data['+ index +'] in config.json'};
			if( typeof(file.file)=='undefined') throw {message :'no field : "file" in data['+ index +'] in config.json'};
			var type = file.type;
			var json;
			config.types[type]={"find":file.find};
			var data = fs.readFileSync(config.dataPath+file.file, 'utf8');
			json = JSON.parse(data);
			parseFile(file, json,config);
		} catch(e) {
			main.dumpError(e,file.file);
		}
	});
}

exports.initKoa = function (app,route) {

}

function parseFile(file,json,config) {
	var type = file.type;
	if(typeof(file.keep)!='undefined') {
		json.features = json.features.filter(function(f){
			return f.properties[file.keep.key]==file.keep.value;
		});
	}
	if (json.features) {
		json.features.forEach(function (feature,index){
			//if(typeof(feature.properties.TYPE)!='undefined') feature.properties.type = feature.properties.TYPE;
			if(typeof(feature.properties.type)=='undefined') feature.properties.type = type;
			if(typeof(feature.properties.CODE)=='undefined') feature.properties.CODE = index;
			if(typeof(feature.properties.id)=='undefined') feature.properties.id = feature.properties.CODE;
			if (!config.types[feature.properties.type]) config.types[feature.properties.type]={"find":config.types[type].find};
			var visible = (typeof(feature.properties.arr_visible)=='undefined'?feature.properties.ARR_VISIBLE:feature.properties.arr_visible);
			if(typeof(visible)=='undefined') visible="1";
			if(findTypes.indexOf(type)!=-1 && visible=="1") {
				var f = JSON.parse(JSON.stringify(feature));//résoud les problemes de copy par pointeur
				global.findText.features.push(f);
			}
			if(type == 'pointArret') {
				var cluster = feature.properties.ZONE.replace('_',':').toUpperCase();
				if(!global.zones[cluster]) global.zones[cluster] = {poteaux:[]};
				var code = feature.properties.CODE.replace('_',':');
				if (cluster.substr(0,3) == 'C38' && global.zones[cluster].poteaux.length > 0) {// on fait une liste de poteaux pour le C38 car il supporte une requete multipoteaux
					global.zones[cluster].poteaux[0] = global.zones[cluster].poteaux[0]+','+code;
				} else {
					global.zones[cluster].poteaux.push(code);
				}
				if(feature.properties.lgn) global.poteaux[code]={lgn:feature.properties.lgn.replace(/\_/g,':').split(',')};
			}
			if(type == 'arret' && feature.properties.arr_visible=='1') {
				var f = {
					"type": "Feature",
					"properties": {
						"CODE": feature.properties.CODE.replace('_',':'),
						"LIBELLE": feature.properties.LIBELLE,
						"COMMUNE": feature.properties.COMMUNE,
						"type": "arr_visible",
						"id": feature.properties.id.replace('_',':')
					},
					"geometry": {
						"type": "Point",
						"coordinates": [feature.geometry.coordinates[0],feature.geometry.coordinates[1]]
					}
				};
				global.poi.features.push(f);
			}
			if(type == 'arret') {
				global.zonesOTP[feature.properties.id.replace('_',':')] = feature.properties.CODE.split('_')[1];
			}
		});
	}
	if( json.features && typeof(json.features[0].geometry)!='undefined') {
		if(json.features[0].geometry.type == 'Point') {
			global.poi.features=global.poi.features.concat(json.features);
			console.log(type+' loaded, total : '+global.poi.features.length+' elements (+'+json.features.length+')');
		}
	}
}

exports.initTest = function (config) {	
	var o = { "features": [] };
	var iTime = (new Date()).getTime();
	var sNsv = "";
	var oMsg = { 
		"PMV" : [
			"|   |    metromobilite.fr |   |   TOUTES LES|   SOLUTIONS POUR|    SE DEPLACER|   $|    Dans les agences |    de mobilité|   |    on me conseille|    sur mes|    déplacements |   ",
			"Voies sur berge ouvertes",
			"RN 90"
		]	
	};	
	
	global.poi.features.forEach(function (f,index){
		var code = f.properties.CODE; //|| f.properties.code;
		if(code) {
			switch(f.properties.type) {
				case "PMV":
					//fichier Json Lignes exemple :  { "properties": { "CODE": "GRE_PMV_1001", "MESSAGES": "XXX"}}							
					o.features.push({"properties": { "type":"PMV", "code":f.properties.CODE, "time":iTime, "messages":oMsg.PMV[parseInt(Math.random() * 3)] } });
					break;
					
				case "PME":
				
					// Q quantité véhicule par 6 minutes
					// code ^gre = 180
					// code ^dde = 400
					// T taux d'occupation du capteur %
					// 100
					// V vitesse
					// code ^gre = -1
					// code ^dde = 100					
				
					o.features.push({"properties": { "type":"PME", "code":f.properties.CODE, "time":iTime, "libelle":f.properties.LIBELLE, "Q":parseInt(Math.random() * (/^gre/i.test(f.properties.CODE) ? 180 : 400)), "T": parseInt(Math.random() * 100), "V":	(/^gre/i.test(f.properties.CODE) ? (-1) : parseInt(Math.random() * 120))} });
					break;

				case "PAR":
					// { "properties": { "code": "", "time": "", "type": "PAR|PKG", "dispo": "-1|nombrePlacesLibres", "nsv_id": "-1|niveauService" }}				
					o.features.push({"properties": { "code":f.properties.CODE, "time":iTime, type:"PAR", "dispo":parseInt(Math.random() * f.properties.TOTAL), "nsv_id":parseInt(Math.random() * 5) } });
					break;
					
				case "PKG":
					// ne pas prendre les -1
					// { "properties": { "code": "", "time": "", "type": "PAR|PKG", "dispo": "-1|nombrePlacesLibres", "nsv_id": "-1|niveauService" }}
					o.features.push({"properties": { "code":f.properties.CODE, "time":iTime, type:"PKG", "dispo":parseInt(Math.random() * f.properties.TOTAL), "nsv_id":parseInt(Math.random() * 5) } });
					break;
					
				default:
					//console.log(f.properties.TYPE);
					break;
			}
		}
	});
	
	if (o.features.length) {
		dyn.ajouterDyn(o);
	}	
}