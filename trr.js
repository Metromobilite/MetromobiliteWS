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

// module de distribution des geometries des tronçons routiers

var main = require('./index');
var fs = require('fs');
var querystring = require('querystring');
var polyline = require('./polyline');
var dyn = require('./dynWs');

global.troncons={"type": "FeatureCollection", "features": []};
global.tronconsP={"type": "FeatureCollection", "features": []};

exports.init = function *(config) {
	var file = config.plugins.trr.file;
	var type = config.plugins.trr.types[0];
	var data = fs.readFileSync(config.dataPath+file, 'utf8');
	var json = JSON.parse(data);

	json.features.forEach(function (f,index){
		//if(typeof(f.properties.type)=='undefined') f.properties.type = type;
		if(typeof(f.properties.id)=='undefined') f.properties.id = f.properties.CODE;
		
		if (f.geometry.type == "MultiLineString") {//si les troncon sont en MultiLineString on les passe en LineString
			f.geometry.type = "LineString";
			f.geometry.coordinates = f.geometry.coordinates[0];
		}
		var p = JSON.parse(JSON.stringify( f.properties));//résoud les problemes de copy par pointeur
		global.tronconsP.features.push({"properties":p});
		global.tronconsP.features[index].properties.shape = polyline.fromGeoJSON(f,5);
	});

	global.troncons=json;
	console.log(type+' loaded, total : '+global.troncons.features.length+' elements (+'+json.features.length+')');
}

exports.initKoa = function (app,route) {
	// http://data.metromobilite.fr/api/troncons/json
	app.use(route.get('/api/troncons/json', function *() {
		try {
			var params = querystring.parse(this.querystring);
			var poiTyped={"type": "FeatureCollection", "features": []};
			poiTyped.features = global.troncons.features.filter(function(f){
				return (!params.niveau || f.properties.NIVEAU == params.niveau);
			});
			this.body = poiTyped;
		} catch(e){
			dumpError(e,'/api/troncons/json');
		}
	}));
	
	// http://data.metromobilite.fr/api/troncons/poly
	app.use(route.get('/api/troncons/poly', function *() {
		try {
			var params = querystring.parse(this.querystring);
			var poiTyped={"type": "FeatureCollection", "features": []};
			poiTyped.features = global.tronconsP.features.filter(function(f){
				return (!params.niveau || f.properties.NIVEAU == params.niveau);
			});
			this.body = poiTyped;
		} catch(e){
			dumpError(e,'/api/troncons/poly');
		}
	}));
}

exports.initTest = function (config) {
	
	// "{ \"features\": [ {\"properties\": { \"type\":\"trr\", \"code\":\"N1_999\", \"nsv_id\":\"1\", \"time\": %TMS%000} } ] }"
	
	var o = { "features": [] };
	var iTime = (new Date()).getTime();
	
	var type = config.plugins.trr.types[0];
	global.troncons.features.forEach(function (f,index){
		if(f.properties.CODE) {
			o.features.push({"properties": { "type":type, "code":f.properties.CODE, "nsv_id":"1", "time": iTime } });
			//console.log(f.properties.CODE);
		}
	});
	
	if (o.features.length) {
		dyn.ajouterDyn(o);
	}
}