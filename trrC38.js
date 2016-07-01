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

// module pour la distribution des tronçons routiers departementaux (statique/dynamique non separable)

var CronJob = require('cron').CronJob;
var request = require('request');
var polyline = require('./polyline');
var dyn = require('./dynWs');
var main = require('./index');

exports.type='trrC38';
var urlC38,keyC38;
exports.init = function *(config) {
	urlC38 = main.getConfig().plugins.trrC38.url;
	keyC38 = main.getConfig().plugins.trrC38.key;
}
exports.initDynamique = function() {
	var jobTrrC38 = new CronJob({
		cronTime: '00 */6 * * * *',//tous les 6 minutes
		onTick: exports.getDynamique,
		runOnInit:true,
		start: true,
		timeZone: "Europe/Paris"
	});
}
//Recupere les tronçon et le niveaux de service C38, et les formates
exports.getDynamique = function() {
	var url = urlC38+'/traffic/v2/GetTrafficStatus/json?OperatorIds=12&OnlyPublished=true' + keyC38;
	request.get({url:url,timeout: 50000,json: true}, function(err,resp) {
		if(!err && resp.body && resp.body.Data) {
			var t = new Date();
			var trrC38 = {type: 'FeatureCollection', features: translateC38Objet(resp.body) };
			dyn.ajouterDyn(trrC38,true);
		} else {
			console.log('ECHEC des niveaux de service C38');
		}
	});
	return false;
}

//converti les tronçons du format WKT au format encoded polyline
function translateC38Objet(C38Objet) {
	var features = [];
	var t = new Date().getTime();
	C38Objet.Data.forEach(function (data,index) {
		if (data.Type != '0') { //Type (string) = ['0:Unknow' or '1:Free' or '2:Heavy' or '3:Congested' or '4:Blocked'] .... idem Metro
			features.push({ properties:{type:exports.type,'shape':convertWKTToEncodedPolylineObjet(data.Shape), 'nsv_id':data.Type, 'time': t, 'code':exports.type+'_' + index} });
		}
	});
	
	return features;
}
function convertWKTToEncodedPolylineObjet(WKTObjet) {
	var lines = [];
	var rawObj = WKTObjet.replace('MULTILINESTRING ((','').replace('))','');
	
	rawObj.split('), (').forEach(function (lineString,indexLineString) {
		var coordinates = [];
		lineString.split(', ').forEach(function (lonLat,indexLonLat) {
			if (lonLat.split(' ').length == 2) {
					coordinates.push(new Array(parseFloat(lonLat.split(' ')[1]),parseFloat(lonLat.split(' ')[0])));
			}
			else
				console.log('Error convertWKTToEncodedPolylineObjet : ' + lonLat + " lonLat.split(' ').length != 3");
		});
		 lines.push(polyline.encode(coordinates,5));
	});
	return lines;
}