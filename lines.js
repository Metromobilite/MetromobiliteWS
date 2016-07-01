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

// module de distribution des geometries des lignes de transport en commun

var fs = require('fs');
var main = require('./index');
var querystring = require('querystring');

var dyn = require('./dynWs');
var polyline = require('./polyline');

global.lignesTypees=[];
global.lignes={"type": "FeatureCollection", "features": []};
global.lignesP={"type": "FeatureCollection", "features": []};

exports.init = function *(config) {
	var file = config.plugins.lines.lineFile;
	var type = config.plugins.lines.lineType;
	var data = fs.readFileSync(config.dataPath+file, 'utf8');
	var json = JSON.parse(data);
	global.lignesTypees = json;
	console.log(type+' loaded, total : '+global.lignesTypees.length+' elements (+'+json.length+')');
	

	file = config.plugins.lines.geomFile;
	type = config.plugins.lines.geomType;
	var data = fs.readFileSync(config.dataPath+file, 'utf8');
	var json = JSON.parse(data);

	json.features.forEach(function (feature,index){
		//if(typeof(feature.properties.type)=='undefined') feature.properties.type = type;
		if(typeof(feature.properties.id)=='undefined') feature.properties.id = feature.properties.CODE;
	});
	//global.lignes.features=global.lignes.features.concat(json.features);
	global.lignes=json;
	console.log(type+' loaded, total : '+global.lignes.features.length+' elements (+'+json.features.length+')');
	
	global.lignes.features.forEach(function (f,index){
		var p = JSON.parse(JSON.stringify( f.properties));//résoud les problemes de copy par pointeur
		global.lignesP.features.push({"properties":p});
		global.lignesP.features[index].properties.shape = polyline.fromGeoJSON(global.lignes.features[index],5);
	});

}

exports.initKoa = function (app,route) {
	
	// http://data.metromobilite.fr/api/lines/json?types=ligne&codes=SEM_B,SEM_C,SEM_A,SEM_D,SEM_E
	app.use(route.get('/api/lines/json', function *() {
		try {
			var params = querystring.parse(this.querystring);
			var poiTyped={"type": "FeatureCollection", "features": []};
			if (params.codes) {
				var codes = params.codes.split(',');
				poiTyped.features = global.lignes.features.filter(function(f){
					return (codes.indexOf(f.properties.CODE)!=-1);
				});
			}
			if (params.reseaux) {
				var reseaux = params.reseaux.split(',');
				poiTyped.features = global.lignes.features.filter(function(f){
					return (reseaux.indexOf(f.properties.CODE.substr(0,3))!=-1);
				});
			}
			this.body = poiTyped;
		} catch(e){
			dumpError(e,'/api/lines/json');
		}
	}));
	
	// http://data.metromobilite.fr/api/lines/poly?types=ligne&codes=SEM_B,SEM_C,SEM_A,SEM_D,SEM_E
	app.use(route.get('/api/lines/poly', function *() {
		try {
			var params = querystring.parse(this.querystring);
			var poiTyped={"type": "FeatureCollection", "features": []};
			if (params.codes) {
				var codes = params.codes.split(',');
				poiTyped.features = global.lignesP.features.filter(function(f){
					return (codes.indexOf(f.properties.CODE)!=-1);
				});
			}
			if (params.reseaux) {
				var reseaux = params.reseaux.split(',');
				poiTyped.features = global.lignesP.features.filter(function(f){
					return (reseaux.indexOf(f.properties.CODE.substr(0,3))!=-1);
				});
			}
			this.body = poiTyped;
		} catch(e){
			dumpError(e,'/api/lines/poly');
		}
	}));
}

exports.initTest = function (config) {
	
	// "{ \"features\": [ {\"properties\": { \"type\":\"ligne\", \"code\":\"N1_999\", \"nsv_id\":\"1\", \"time\": %TMS%000} } ] }"
	
	var o = { "features": [] };
	var iTime = (new Date()).getTime();
	
	var type = config.plugins.lines.geomType;
	global.lignes.features.forEach(function (f,index){
		if(f.properties.CODE) {
			o.features.push({"properties": { "type":type, "code":f.properties.CODE, "nsv_id":"1", "time": iTime } });
			//console.log(f.properties.CODE);
		}
	});
	
	if (o.features.length) {
		dyn.ajouterDyn(o);
	}
}