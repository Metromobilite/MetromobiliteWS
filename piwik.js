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

// module piwik qui trace les requetes dans piwik

var main = require('./index');
var pwk = require('piwik');

var piwik,domain,siteId;

exports.init = function *(config) {
	piwik = pwk.setup (config.plugins.piwik.url);
	domain = config.plugins.piwik.domain;
	siteId = config.plugins.piwik.siteId;
}
exports.initKoa = function (app,route) {
	app.use(function* (next) {
		try{
			piwik.track (
			  {
				idsite:siteId,
				url:domain+this.request.url,
				action_name: this.request.url,
				ua: this.request.header['user-agent'],
				lang: this.request.header['accept-language']
				//_cvar:       { '1': ['group', 'customer'] }
			  }
			);
			yield next;
		} catch(e){
			main.dumpError(e,'Piwik');
		}
	});
}