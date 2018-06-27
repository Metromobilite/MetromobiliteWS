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

var turf = require('@turf/turf');
var main = require('./index');
var fs = require('fs');
var querystring = require('querystring');
var dyn = require('./dynWs');

global.findText={"type": "FeatureCollection", "features": []};
var findTypes = ['rue','lieux','arret'];

var bboxPolygonMetro;
var bboxPolygonGresivaudan;
var bboxPolygonVoironnais;
exports.types=[];
exports.init = async function (config) {
	if( typeof(config.data)=='undefined') throw 'no data field in config.json';
		
	/*Préparation du filtrage sur les EPCI - Début*/
	var file = config.plugins.points.comFile;
	var data = fs.readFileSync(config.dataPath+file, 'utf8');
	var communes = JSON.parse(data);
	
	var communesMetro={"type": "FeatureCollection", "features": []};
	var communesGresivaudan={"type": "FeatureCollection", "features": []};
	var communesVoironnais={"type": "FeatureCollection", "features": []};
	
	communesMetro.features = communes.features.filter(function(f){
				return (String(f.properties.epci).indexOf('LaMetro')!=-1);
		});
	communesGresivaudan.features = communes.features.filter(function(f){
				return (String(f.properties.epci).indexOf('LeGresivaudan')!=-1);
		});
	communesVoironnais.features = communes.features.filter(function(f){
				return (String(f.properties.epci).indexOf('PaysVoironnais')!=-1);
		});
		
	console.log('Communes loaded : '+communes.features.length+ ' Metro (' + communesMetro.features.length + '), Gresivaudan (' + communesGresivaudan.features.length + '), Voironnais (' + communesVoironnais.features.length + ')');

	var bboxMetro = turf.bbox(communesMetro);
	bboxPolygonMetro = turf.bboxPolygon(bboxMetro);
	
	var bboxGresivaudan = turf.bbox(communesGresivaudan);
	bboxPolygonGresivaudan = turf.bboxPolygon(bboxGresivaudan);
	
	var bboxVoironnais = turf.bbox(communesVoironnais);
	bboxPolygonVoironnais = turf.bboxPolygon(bboxVoironnais);

	/*Préparation du filtrage sur les EPCI - Fin*/
	
	config.data.forEach(function (file,index){
		try {
			if( typeof(file.type)=='undefined') throw {message :'no field : "type" in data['+ index +'] in config.json'};
			if( typeof(file.file)=='undefined') throw {message :'no field : "file" in data['+ index +'] in config.json'};
			var type = file.type;
			var json;
			config.types[type]={"find":file.find};
			exports.types.push(type);
			var data = fs.readFileSync(config.dataPath+file.file, 'utf8');
			json = JSON.parse(data);
			parseFile(file, json,config);
		} catch(e) {
			main.dumpError(e,file.file);
		}
	});
	
	bboxPolygonMetro = null;
	bboxPolygonGresivaudan = null;
	bboxPolygonVoironnais = null;
	delete bboxPolygonMetro;
	delete bboxPolygonGresivaudan;
	delete bboxPolygonVoironnais;	
}

//Permet la suppression des doublons (ex dat)
function getSignature(obj){
    if(typeof(obj)==='undefined') return 'undefined';
    var signature = '';
    signature = JSON.stringify(obj.geometry);

    return signature;
}

function parseFile(file,json,config) {

	var type = file.type;
	var signaturesType = [];
	
	json.features = json.features.filter(function(f){

		var bKeep = true;  
		if(typeof(file.keep)!='undefined') {
			bKeep = f.properties[file.keep.key]==file.keep.value;
		}
		//Suppression des doublons (ex dat)
		var bDoublon = false;
		if(file.dedupe) {
			var signature = getSignature(f);
			if (signaturesType.indexOf(signature)!=-1)
				bDoublon = true;
			else 
				signaturesType.push(signature);
		}
		return (bKeep && !bDoublon);
	});

	if (json.features) {
		json.features.forEach(function (feature,index){

			if(typeof(feature.properties.type)=='undefined') feature.properties.type = type;
			if(typeof(feature.properties.CODE)=='undefined') feature.properties.CODE = index;
						
			if((typeof(feature.geometry)!='undefined') && (feature.geometry.type)=='Point')  {
				feature.properties.LaMetro = isInside('LaMetro',feature);
				feature.properties.LeGresivaudan = isInside('LeGresivaudan',feature);
				feature.properties.PaysVoironnais = isInside('PaysVoironnais',feature);
			}
						
			if(typeof(feature.properties.id)=='undefined') feature.properties.id = feature.properties.CODE;
			if (!config.types[feature.properties.type]) config.types[feature.properties.type]={"find":config.types[type].find};
			var visible = (typeof(feature.properties.arr_visible)=='undefined'?feature.properties.ARR_VISIBLE:feature.properties.arr_visible);
			if(typeof(visible)=='undefined') visible="1";
			if(findTypes.indexOf(type)!=-1 && visible=="1") {
				var f = JSON.parse(JSON.stringify(feature));//résoud les problemes de copy par pointeur
				global.findText.features.push(f);
			}
			
		});
	}
	if( json.features && typeof(json.features[0].geometry)!='undefined') {
		if(json.features[0].geometry.type == 'Point') {
			global.ref[type]=json;
			console.log(type+' loaded, total : '+global.ref[type].features.length);
		}
	}	
}

function isInside(epci,feature) {
	switch(epci) {
		
		case 'LaMetro':
			return turf.inside(feature, bboxPolygonMetro);
		case 'LeGresivaudan':
			return turf.inside(feature, bboxPolygonGresivaudan);
		case 'PaysVoironnais':
			return 	turf.inside(feature, bboxPolygonVoironnais);		
		default :
			return false;
	}
}

exports.getPoints = function(types) {
	var res = {type: 'FeatureCollection', features: []};
	for(var i=0; i < types.length;i++){
		var t = types[i];
		if(!!global.ref[t]) 
			res.features = res.features.concat(global.ref[t].features);
		else
			console.error('getPoints : '+t+' not found !');
	}
	return res;
}