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

// module pour la mise a disposition des données météo

var axios = require('axios');
var co = require('co');
var dyn = require('./dynWs');
var main = require('./index');
var CronJob = require('cron').CronJob;
 
var querystring = require('querystring');
var stream = require('koa-stream');
//var range = require('koa-range');
/* cette fonction permet de transmettre les données météo au site metromobilite.
pour pallier le probleme rencontré au passage de http à https 
*/

exports.routes = [
	{
		method: 'get',
		path: '/api/icon/image',
		handler: getIcon,
		meta:{
			description:'L\'icone de la meteo.'
		},
		groupName: 'Outils',
		cors:true,
		private:true
	}
];

exports.initDynamique = function() {
	    var jobAtmo = new CronJob({
		cronTime: '05 01 * * * *', //toutes heures a 1 minutes
        onTick: getMeteo,
		runOnInit: true,
        start: true,
        timeZone: "Europe/Paris"
    });
}

// https://data.metromobilite.fr/api/icon/image?name=faibles-passages-nuageux.png
// http://localhost:3000/api/icon/image?name=eclaircies.png
async function getIcon(ctx) {
	try {
		var params = querystring.parse(ctx.querystring);		
		if (global.dynIconMeteo[params.name]) {
			stream.buffer(ctx, global.dynIconMeteo[params.name], 'image/png', {allowDownload: true});
			ctx.set('Content-Type', 'image/png');
			ctx.body = global.dynIconMeteo[params.name];
		}
		else {
			ctx.body = '';
		}
		
	} catch(e){
		ctx.body = 'error';
		main.dumpError(e,'getIcon');
	}	
}
//http://127.0.0.1:3000/api/dyn/meteo/json
async function getMeteo() {
	var config = main.getConfig();		 
	var resp,respIcon;
	try{
		//Recuperation des donnée meteo
		
		resp = await axios({
			method:'get',
			url:config.plugins.meteo.url, 
			timeout: 50000,
			responseType: 'json'
		});
		if (resp.status!=200 || resp.statusText!='OK' || !resp.data) {
			console.error('Meteo : Erreur de recuperation des données, status : ' + resp.status + ' Message : ' + resp.statusText);
			return;
		}
		
		/*if (resp.data[0]!='{') {
			console.log('getMeteo erreur de connexion');
			return;
		}*/
		
		//surcharge du nom de l'icone et stockage en mémoire de l'icone
		var urlIcon = resp.data.fcst_day_0.icon;
		var filename = urlIcon.split('/')[urlIcon.split('/').length-1];
		resp.data.fcst_day_0.icon = filename;
		dyn.ajouterType('meteo',resp.data);
		
		var respIcon = await axios({
			method:'get',
			url:urlIcon, 
			timeout: 50000,
			responseType: 'arraybuffer'
		});
		if (respIcon.status!=200 || respIcon.statusText!='OK' || !respIcon.data) {
			console.error('Meteo : Erreur de recuperation de l\'icone, status : ' + respIcon.status + ' Message : ' + respIcon.statusText);
			return;
		}
		global.dynIconMeteo[filename] = respIcon.data;

					
	} catch (e) {
		main.dumpError(e,'meteo');
	}
	 
	return false;
}
 

