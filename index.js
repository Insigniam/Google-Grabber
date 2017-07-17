var google = require('googleapis');
var fs = require('fs');
var dav = require('dav');
var directory = google.admin('directory_v1');
var mkdirp = require('mkdirp');
var request = require('request');

//dav.debug.enabled = true;

var key = require('./insigniam-google-grabber-d977a5eb9295.json');

function processUserContacts(user) {
	return new Promise((resolve, reject) => {
		console.log('Backing up ' + user.name.fullName + '\'s contacts...');

		new google.auth.JWT(
			key.client_email,
			null,
			key.private_key,
			['https://www.googleapis.com/auth/carddav', 'https://www.googleapis.com/auth/admin.directory.user.readonly', 'https://www.googleapis.com/auth/calendar'],
			user.primaryEmail
		).authorize((err, tokens) => {
			if (err) {
				console.log(err);
				return;
			}

			var xhr = new dav.transport.OAuth2(
				new dav.Credentials({
					accessToken: tokens.access_token
				})
			);

			dav.createAccount({accountType: 'carddav', loadObjects: true, server: 'https://www.googleapis.com/carddav/v1/principals/' + user.primaryEmail, xhr: xhr})
			.then(account => {
				var path = './tmp/' + user.name.fullName + '/contacts/';
				
				if(account.addressBooks[0].objects.length > 0) {
					mkdirp.sync(path);
				}
			
				account.addressBooks[0].objects.forEach(vcard => {	
					var fileName = vcard.url.split('/');
					fileName = fileName[fileName.length - 1] + '.vcf';

					fs.writeFileSync(path + fileName, vcard.addressData);
				});	
				
				resolve();
			});
		});
	});
}

function processUserCalendars(user) {
	return new Promise((resolve, reject) => {
		console.log('Backing up ' + user.name.fullName + '\'s calendars...');

		new google.auth.JWT(
			key.client_email,
			null,
			key.private_key,
			['https://www.googleapis.com/auth/carddav', 'https://www.googleapis.com/auth/admin.directory.user.readonly', 'https://www.googleapis.com/auth/calendar'],
			user.primaryEmail
		).authorize((err, tokens) => {
			if (err) {
				console.log(err);
				return;
			}
			
			var path = './tmp/' + user.name.fullName + '/';
			mkdirp.sync(path);
			
			request.get('https://apidata.googleusercontent.com/caldav/v2/' + user.primaryEmail + '/events')
			.auth(null, null, true, tokens.access_token)
			.pipe(fs.createWriteStream(path + user.primaryEmail + '.ics'));
			
			resolve(true);
		});
	});
}

new Promise(function(resolve, reject) {
	var jwtClient = new google.auth.JWT(
		key.client_email,
		null,
		key.private_key,
		['https://www.googleapis.com/auth/carddav', 'https://www.googleapis.com/auth/admin.directory.user.readonly', 'https://www.googleapis.com/auth/calendar'],
		'sysadmin@insigniam.com'
	);


	jwtClient.authorize(function (err, tokens) {
		if (err) {
			console.log(err);
			return;
		}
	
	
		directory.users.list({auth: jwtClient, customer: 'my_customer'}, function(err, res) {
			resolve(res.users.filter(user => !user.suspended));
		});
	});
}).then(users => {
	var userContactsPromises = users.map(user => () => processUserContacts(user));
	var userCalendarsPromises = users.map(user => () => processUserCalendars(user));
	
	userContactsPromises.concat(userCalendarsPromises)
	.reduce((promise, func) => promise.then(func), Promise.resolve());
});

