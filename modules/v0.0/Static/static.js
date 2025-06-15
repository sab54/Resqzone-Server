// Array Shuffler
function shuffle(array) {
	var currentIndex = array.length,
		temporaryValue,
		randomIndex;

	// While there remain elements to shuffle...
	while (0 !== currentIndex) {
		// Pick a remaining element...
		randomIndex = Math.floor(Math.random() * currentIndex);
		currentIndex -= 1;

		// And swap it with the current element.
		temporaryValue = array[currentIndex];
		array[currentIndex] = array[randomIndex];
		array[randomIndex] = temporaryValue;
	}

	return array;
}

// extract root domain
function extractRootDomain(url) {
	var addomain = extractHostname(url),
		splitArr = addomain.split('.'),
		arrLen = splitArr.length;

	//extracting the root domain here
	//if there is a subdomain
	if (arrLen > 2) {
		addomain = splitArr[arrLen - 2] + '.' + splitArr[arrLen - 1];
		//check to see if it's using a Country Code Top Level Domain (ccTLD) (i.e. ".me.uk")
		if (splitArr[arrLen - 2].length == 2 && splitArr[arrLen - 1].length == 2) {
			//this is using a ccTLD
			addomain = splitArr[arrLen - 3] + '.' + addomain;
		}
	}
	return addomain;
}

function extractHostname(url) {
	var hostname;
	//find & remove protocol (http, ftp, etc.) and get hostname

	if (url.indexOf('://') > -1) {
		hostname = url.split('/')[2];
	} else {
		hostname = url.split('/')[0];
	}

	//find & remove port number
	hostname = hostname.split(':')[0];
	//find & remove "?"
	hostname = hostname.split('?')[0];

	return hostname;
}

function getIp(req, res) {
	var ip = (req.headers['x-forwarded-for'] || '').split(',').pop().trim() || req.connection.remoteAddress || req.socket.remoteAddress || req.connection.socket.remoteAddress;
	var geoip = require('geoip-lite');
	var geodata = geoip.lookup(ip);
	var info = { ip: ip, geoData: geodata };
	return info;
}

module.exports = { shuffle: shuffle, extractRootDomain: extractRootDomain, extractHostname: extractHostname, getIp: getIp };
