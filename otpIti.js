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

var kRequest = require('koa-request');
var main = require('./index');
var querystring = require('querystring');

var urlOtp;

exports.initKoa = function (app,route) {
	var urlOtp = main.getConfig().plugins.otpIti.url;
	
	// http://data.metromobilite.fr/api/routers/default/plan?fromPlace=45.18022185817286,5.70988655090332&toPlace=45.18693699088948,5.754432678222655&time=1:01pm&date=05-17-2016&mode=BICYCLE&maxWalkDistance=750&arriveBy=false&wheelchair=false&showIntermediateStops=false
	app.use(route.get('/api/routers/:router/plan', function *(router) {
		try {
			//var params = querystring.parse(this.querystring);

			var options = {url:urlOtp+'/routers/'+router+'/plan?'+this.querystring, timeout: 10000,json: true};
			if(!options) this.body = [];
			else {
				if(main.isDebug()) console.log(options.url);
				var res = yield kRequest.get(options);
				this.body = res.body;
			}
		} catch(e){
			main.dumpError(e,'/api/routers/'+router+'/plan');
		}
	}));
	//http://data.metromobilite.fr/api/routers/default/isochrone?algorithm=recursiveGrid&fromPlace=45.18258096098725,5.7261478359375&date=2016/05/10&time=08:00:00&maxWalkDistance=1000&mode=BICYCLE&precisionMeters=200&cutoffSec=600&cutoffSec=1200&cutoffSec=1800&cutoffSec=2400
	app.use(route.get('/api/routers/:router/isochrone', function *(router) {
		try {
			var options = {url:urlOtp+'/routers/'+router+'/isochrone?'+this.querystring, timeout: 50000,json: true};
			if(!options) this.body = [];
			else {
				if(main.isDebug()) console.log(options.url);
				var res = yield kRequest.get(options);
				this.body = res.body;
			}
		} catch(e){
			main.dumpError(e,'/api/routers/'+router+'/isochrone');
		}
	}));

}