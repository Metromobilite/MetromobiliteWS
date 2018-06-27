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

// module de contact de metromobilite.fr
const Joi = require('koa-joi-router').Joi;
var main = require('./index');
var querystring = require('querystring');
var nodemailer = require('nodemailer');

exports.routes = [
	{
		method: 'post',
		path: '/api/contact/mail',
		handler: postMail,
		meta:{
			description:'Envoi de mail depuis le formulaire de contact.'
		},
		groupName: 'Outils',
		cors:false,
		private:true,
		validate:{
			type: 'json',
			body:{
				name:Joi.string(),
				subject:Joi.string().required(),
				text:Joi.string().required(),
				mail:Joi.string().required()
			}
		}
	}
];
//http://data.metromobilite.fr/api/contact/mail
// le body doit contenir : name, subject, text, mail
async function postMail(ctx) {
	try {
		/*if (ctx.request.header['content-type'] == 'application/json') {
			ctx.request.body = await parse.json(ctx);
		}*/
		if(ctx.request.body.text=='' || ctx.request.body.mail=='' || ctx.request.body.subject == '') {
			ctx.body = ctx.response.body = {message:"Missing required fields !"};
			return;
		}
		var transporter = initMailer();
		envoieMailContact(transporter,ctx.request.body);
		ctx.response.body = { status : 200 };
	} catch(e) {
		ctx.response.body = { status : 500 };
		main.dumpError(e,'contact.postMail');
	}
}

function initMailer() {
    var defaults = {
        from: 'contact-no-reply@completel.fr'
    }
    var options = {
        host: 'smtp.completel.fr',
        port: 25,
        secure: false,
        disableFileAccess:true,
        disableUrlAccess:true
    }
    var transporter = nodemailer.createTransport(options, defaults);

    // verify connection configuration
    transporter.verify(function(error, success) {
        if (error) {
            console.log(error);
        } else {
            console.log('Connection SMTP : Ok !');
        }
    });
    return transporter;
}
function envoieMailContact(transporter,obj){
	if(obj.text=='' || obj.mail=='') return;
	var message = {
		from: obj.mail,
		to: main.getConfig().plugins.contact.mailsDest,
		subject: obj.subject,
		text: obj.text+'\r\n\r\n'+obj.name,
		html:'<p>'+obj.text+'</p><br>'+obj.name
	};
	transporter.sendMail(message, function(err,info){
		if(err){
			console.error(err);
		}
		if(info && info.rejected && info.rejected.length > 0) {
			console.log('Emails rejetés : '+info.rejected);
		}
	});
}