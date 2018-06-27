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

var fs = require('fs');
var querystring = require('querystring');
const Joi = require('koa-joi-router').Joi;
var main = require('./index');
var polyline = require('./polyline');
var dyn = require('./dynWs');

global.vhP={"type": "FeatureCollection", "features": []};

exports.routes = [
	{
		method: 'get',
		path: '/api/vh/:format',
		handler: getVh,
		meta:{
			description:'La geometrie des axes de la viabilité hivernale en geojson ou en encoded polyline.'
		},
		groupName: 'Référentiel',
		cors:true,
		private:true,
		validate:{
			params:{
				format:Joi.string().valid('json','poly')
			}
		}
	}
];
exports.initRef = function(type){
	global.vhP.features=[];
	global.ref[type].features.forEach(function (feature,index){
		if(typeof(feature.properties.id)=='undefined') feature.properties.id = feature.properties.code;

		//version poly
		var p = JSON.parse(JSON.stringify( feature.properties));//résoud les problemes de copy par pointeur
		global.vhP.features.push({properties:p});
		global.vhP.features[index].properties.shape = polyline.fromGeoJSON(global.ref[type].features[index],5);
	});
	
	console.log(type+' loaded, total : '+global.ref[type].features.length);	
}

async function getVh(ctx) {
	try {
		var format = ctx.request.params.format;
		if(format == 'json'){
			ctx.body = global.ref['vh'];
		} else if (format == 'poly'){
			ctx.body = global.vhP;
		}
	} catch(e){
		dumpError(e,'/api/vh/:format');
	}
}