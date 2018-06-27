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
const Joi = require('koa-joi-router').Joi;

exports.routes = [
	{
		method: 'get',
		path: '/api/cam/time',
		handler: getCamTime,
		meta:{
			description:'L\'heure de la webcam.'
		},
		groupName: 'Temps réel',
		cors:true,
		private:true,
		validate:{
			query:{
				name:Joi.string(),
				key:Joi.number()
			}
		}
	},
	{
		method: 'get',
		path: '/api/cam/video',
		handler: getCamVideo,
		meta:{
			description:'La video de la webcam.'
		},
		groupName: 'Temps réel',
		cors:true,
		private:true,
		validate:{
			query:{
				name:Joi.string(),
				key:Joi.number()
			}
		}
	}
];

// * http://data.metromobilite.fr/api/cam/time?name=RondeauNord.mp4
// * http://localhost:3000/api/cam/time?name=RondeauNord.mp4
async function getCamTime(ctx) {
	try {
		var params = querystring.parse(ctx.querystring);
		
		if (global.dynCam[params.name])
			ctx.body = global.dynCam[params.name].time;
		else
			ctx.body = '0';
		
	} catch(e){
		main.dumpError(e,'webcam.getCamTime');
	}
}

// * http://data.metromobilite.fr/api/cam/video?name=RondeauNord.mp4
// * http://localhost:3000/api/cam/video?name=RondeauNord.mp4
async function getCamVideo(ctx) {
	try {
		var params = querystring.parse(ctx.querystring);
		
		
		if (global.dynCam[params.name]) {
			stream.buffer(ctx, global.dynCam[params.name].video, 'video/mp4', {allowDownload: true});
			ctx.set('Content-Type', 'video/mp4');
			ctx.set('Content-Length', global.dynCam[params.name].time);
			ctx.body = global.dynCam[params.name].video;
		}
		else {
			ctx.body = '';
		}
		
	} catch(e){
		main.dumpError(e,'webcam.getCamVideo');
	}
}