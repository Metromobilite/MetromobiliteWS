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

// module passe-plat pour requetes otp liées aux itineraires et isochrones

const Joi = require('koa-joi-router').Joi;
var axios = require('axios');
var main = require('./index');
var querystring = require('querystring');

const urlOtp = main.getConfig().plugins.otpIti.url;

exports.routes = [
	{
		method: 'get',
		path: '/api/routers/:router/plan',
		handler: plan,
		meta:{
			description:'Calcul d\'itineraire.'
		},
		groupName: 'Outils',
		cors:true,
		validate:{
			params:{
				router:Joi.string().valid('default')
			}
		}
	},
	{
		method: 'get',
		path: '/api/routers/:router/isochrone',
		handler: isochrone,
		meta:{
			description:'Isochrones.'
		},
		groupName: 'Outils',
		cors:true,
		private:true,
		validate:{
			params:{
				router:Joi.string().valid('default')
			}
		}
	},
	{
		method: 'get',
		path: '/api/routers/:router/serverinfo',
		handler: serverinfo,
		meta:{
			description:'Infos sur le calculateur d\'itineraire.'
		},
		groupName: 'Outils',
		cors:true,
		validate:{
			params:{
				router:Joi.string().valid('default')
			}
		}
	}
];

// http://data.metromobilite.fr/api/routers/default/plan?fromPlace=45.18022185817286,5.70988655090332&toPlace=45.18693699088948,5.754432678222655&time=1:01pm&date=05-17-2016&mode=BICYCLE&maxWalkDistance=750&arriveBy=false&wheelchair=false&showIntermediateStops=false
async function plan(ctx) {
	try {
		var router = ctx.request.params.router;
		var options = {method:'get', url:urlOtp+'/routers/'+router+'/plan?'+ctx.querystring, timeout: 10000, responseType: 'json'};
		if(main.isDebug()) console.log(options.url);
		var res = await axios(options);
		if (res.status!=200 || res.statusText!='OK' || !res.data) {
			console.error('otpIti : Erreur de requete plan, status : ' + res.status + ' Message : ' + res.statusText);
			ctx.body = {};
		} else {
			ctx.body = res.data;
		}
		
	} catch(e){
		main.dumpError(e,'otpIti.plan');
	}
}
//http://data.metromobilite.fr/api/routers/default/isochrone?algorithm=recursiveGrid&fromPlace=45.18258096098725,5.7261478359375&date=2016/05/10&time=08:00:00&maxWalkDistance=1000&mode=BICYCLE&precisionMeters=200&cutoffSec=600&cutoffSec=1200&cutoffSec=1800&cutoffSec=2400
async function isochrone(ctx) {
	try {
		var router = ctx.request.params.router;
		var options = {method:'get', url:urlOtp+'/routers/'+router+'/isochrone?'+ctx.querystring, timeout: 50000, responseType: 'json'};
		if(main.isDebug()) console.log(options.url);
		var res = await axios(options);
		if (res.status!=200 || res.statusText!='OK' || !res.data) {
			console.error('otpIti : Erreur de requete isochrone, status : ' + res.status + ' Message : ' + res.statusText);
			ctx.body = {};
		} else {
			ctx.body = res.data;
		}
	} catch(e){
		main.dumpError(e,'otpIti.isochrone');
	}
}
//http://data.metromobilite.fr/api/routers/default/serverinfo
async function serverinfo(ctx) {
	try {
		var router = ctx.request.params.router;
		var options = {method:'get', url:urlOtp, timeout: 10000, responseType: 'json'};
		if(main.isDebug()) console.log(options.url);
		var res = await axios(options);
		if (res.status!=200 || res.statusText!='OK' || !res.data) {
			console.error('otpIti : Erreur de requete serverinfo, status : ' + res.status + ' Message : ' + res.statusText);
			ctx.body = {};
		} else {
			ctx.body = res.data;
		}
	} catch(e){
		main.dumpError(e,'otpIti.serverinfo');
	}
}
