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

// module pour la mise a disposition des données statiques des voitures en autopartage citelib

var axios = require('axios');
var fs = require('fs');
var co = require('co');
var turf = require('@turf/turf');
var dyn = require('./dynWs');
var main = require('./index');

exports.type='citelib';

exports.init = async function (config) {
		
		var data = fs.readFileSync(config.dataPath+config.dataFilter, 'utf8');
		var rectangle = JSON.parse(data);
		var res;
		try{
			res = await axios({
				method:'get',
				url:config.plugins.citiz.url, 
				timeout: 50000,
				responseType: 'json'
			});
		} catch (e) {
			main.dumpError(e,'citiz.init');
		}
		if (res && res.data && Array.isArray(res.data)) {
			global.ref[exports.type]={ type: 'FeatureCollection', features: []};
			res.data.forEach(function (s,index) {
				var f = {
					type: 'Feature',
					properties: {
						CODE: 'C'+s.stationId,
						"Nom de la station": s.name,
						Ville: s.city,
						type: exports.type,
						id: 'C'+s.stationId
					},
					geometry: {
						type: 'Point',
						coordinates: [s.gpsLongitude,s.gpsLatitude]
					}
				};
				if(turf.inside(f, rectangle.features[0])) global.ref[exports.type].features.push(f);
			});
			if (!config.types[exports.type]) config.types[exports.type]={"find":"Nom de la station"};
			
			console.log(exports.type+' loaded, total : '+global.ref[exports.type].features.length);

		} else {
			console.log('ECHEC du statique citiz');
		}

	return false;
}
