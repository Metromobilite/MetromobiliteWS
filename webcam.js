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

// module pour transmettre des video mpeg4 recues en HTTP POST
// la reception des videos se trouve dans dynWS

var main = require('./index');
var querystring = require('querystring');
var stream = require('koa-stream');
var range = require('koa-range');

exports.initKoa = function (app,route) {
	
	app.use(range);
	// * http://data.metromobilite.fr/api/cam/time?name=RondeauNord.mp4
	// * http://localhost:8082/api/cam/time?name=RondeauNord.mp4
	app.use(route.get('/api/cam/time', function *() {
		try {
			var params = querystring.parse(this.querystring);
			
			if (global.dynCam[params.name])
				this.body = global.dynCam[params.name].time;
			else
				this.body = '0';
			
		} catch(e){
			main.dumpError(e,'/api/cam/time');
		}
	}));
	
	// * http://data.metromobilite.fr/api/cam/video?name=RondeauNord.mp4
	// * http://localhost:8082/api/cam/video?name=RondeauNord.mp4
	app.use(route.get('/api/cam/video', function *() {
		try {
			var params = querystring.parse(this.querystring);
			
			
			if (global.dynCam[params.name]) {
				stream.buffer(this, global.dynCam[params.name].video, 'video/mp4', {allowDownload: true});
				this.set('Content-Type', 'video/mp4');
				this.set('Content-Length', global.dynCam[params.name].time);
				this.body = global.dynCam[params.name].video;
			}
			else {
				this.body = '';
			}
			
		} catch(e){
			main.dumpError(e,'/api/cam/video');
		}
	}));
}