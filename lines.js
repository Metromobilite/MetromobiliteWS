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
var querystring = require('querystring');
const Joi = require('koa-joi-router').Joi;
var main = require('./index');
var dyn = require('./dynWs');
var polyline = require('./polyline');

global.lignesTypees=[];
global.lignesTypeesObj={};
global.lignesP={"type": "FeatureCollection", "features": []};

exports.routes = [
	{
		method: 'get',
		path: '/api/lines/:format',
		handler: getLines,
		meta:{
			description:'Les données linéaires en geojson ou en encoded polyline (lignes de tranposrt en commun).'
		},
		groupName: 'Référentiel',
		cors:true,
		validate:{
			params:{
				format:Joi.string().alphanum()
			},
			query:{
				types:Joi.string(),
				codes:Joi.string(),
				reseaux:Joi.string()
			}
		}
	}
]

exports.init = async function (config) {
	var file = config.plugins.lines.lineFile;
	var type = config.plugins.lines.lineType;
	var data = fs.readFileSync(config.dataPath+file, 'utf8');
	var json = JSON.parse(data);
	global.lignesTypees = json;
	console.log(type+' loaded, total : '+global.lignesTypees.length+' elements');
	json.forEach(function (feature,index){
		global.lignesTypeesObj[feature.id]=feature;
	});
}
exports.initRef = function(type){
	global.lignesP.features=[];
	global.ref[type].features.forEach(function (feature,index){
		if(typeof(feature.properties.id)=='undefined') feature.properties.id = feature.properties.CODE;

		//version poly
		var p = JSON.parse(JSON.stringify( feature.properties));//résoud les problemes de copy par pointeur
		global.lignesP.features.push({properties:p});
		global.lignesP.features[index].properties.shape = polyline.fromGeoJSON(global.ref[type].features[index],5);
	});
	
	console.log(type+' loaded, total : '+global.ref[type].features.length);	
}

// http://data.metromobilite.fr/api/lines/json?types=ligne&codes=SEM_B,SEM_C,SEM_A,SEM_D,SEM_E
// http://data.metromobilite.fr/api/lines/poly?types=ligne&codes=SEM_B,SEM_C,SEM_A,SEM_D,SEM_E
async function getLines(ctx) {
	try {
		var format = ctx.request.params.format;
		var features = []
		if (format=='json') features = global.ref['ligne'].features;
		else if(format=='poly') features = global.lignesP.features;

		var params = querystring.parse(ctx.querystring);
		var poiTyped={"type": "FeatureCollection", "features": []};
		if (params.codes) {
			var codes = params.codes.split(',');
			poiTyped.features = features.filter(function(f){
				return (codes.indexOf(f.properties.CODE)!=-1);
			});
		}
		if (params.reseaux) {
			var reseaux = params.reseaux.split(',');
			poiTyped.features = features.filter(function(f){
				return (reseaux.indexOf(f.properties.CODE.substr(0,3))!=-1);
			});
		}
		ctx.body = poiTyped;
	} catch(e){
		main.dumpError(e,'lines.getLines');
	}
}