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

// module pour la distribution de la viabilite hivernale des tronçons routiers 

var CronJob = require('cron').CronJob;
var axios = require('axios');
var polyline = require('./polyline');
var dyn = require('./dynWs');
var main = require('./index');

exports.type='vhC38';
//exports.init = async function () {}

exports.initDynamique = function() {
	var jobVhC38 = new CronJob({
		cronTime: '10 */6 * * * *',//tous les 6 minutes
		onTick: exports.getDynamique,
		runOnInit:true,
		start: true,
		timeZone: "Europe/Paris"
	});
}
//Recupere les tronçon et le niveaux de service C38, et les formates
exports.getDynamique = async function() {
	var url = main.getConfig().plugins.vhC38.url+'/traffic/v2/GetWinterDrivings/json?OperatorIds=12&OnlyPublished=true' + main.getConfig().plugins.vhC38.key;
	var res = await axios({url:url,timeout: 50000,responseType:'json',method:'get'});
	if(res.status == 200 && res.data.Data) {
		var t = new Date();
		dyn.ajouterType(exports.type,translateC38Objet(res.data));
	} else {
		console.log('ECHEC des vh C38');
	}
	return false;
}

//converti les tronçons du format WKT au format encoded polyline
function translateC38Objet(C38Objet) {
	var obj = {};
	var t = new Date().getTime();
	C38Objet.Data.forEach(function (data,index) {
		if (data.Type != '0' && !!data.Shape) { //Type (string) =  [0:'Unknow' or 1:'Normal' or 2:'Tricky' or 3:'Difficult' or 4:'Impossible'] .... idem Metro
			var code = exports.type+'_' + index;
			obj[code]=[{shape:convertWKTToEncodedPolylineObjet(data.Shape), nsv_id:data.Type, time: t}];

		}
	});
	return obj;
}
function convertWKTToEncodedPolylineObjet(WKTObjet) {
	var lines = [];
	var rawObj = WKTObjet.replace('LINESTRING (','').replace(')','');
	
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