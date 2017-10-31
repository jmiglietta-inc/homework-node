'use strict'

/* eslint-disable import/no-extraneous-dependencies */
const download = require('download-package-tarball')
const request = require('request')
const cheerio = require('cheerio')
const fs = require('fs')
const path = require('path')

const __url = "https://www.npmjs.com/browse/depended"
const __itemsPerPage = 36;
var __mutex = 0
var __semaphore = 0 

module.exports = downloadPackages

function downloadPackages (count, callback) {
	console.log("downloadPackages called")

	// while not a real mutex object it serves our purpose of exclusion
	// in case we call into this function again before its done
	if(__mutex != 0) {
		var intvl = setInterval(function() {
			if (__mutex == 0) { 
				clearInterval(intvl)
			} 
		}, 100)		

	}
	__mutex = 1

	// remove any existing file - in case we are rerunning
	var pkgFolder = path.join(__dirname, '/packages')
	deleteFolderRecursive(pkgFolder)
	fs.mkdir(pkgFolder)
	
	// While not a real semaphore, it tracks the count down as the
	// async calls to get the pkg JSON complete
	__semaphore = count

	var offset = 0
	var runningCount = count
	
	while(runningCount > 0) {
		downloadPackageSet(offset, (runningCount > __itemsPerPage) ? __itemsPerPage : runningCount)
		
		runningCount -= __itemsPerPage
		offset += __itemsPerPage
	}
	
	// Here we are making the function work in a synchronous manner
	// by holding off on the callback until all the work is done
	var intvl = setInterval(function() {
		if (__semaphore == 0) { 
			clearInterval(intvl)
			__mutex = 0				
			
			if(callback) {
				return callback()
			} else {
				return
			}
		}
	}, 500)		
}

function downloadPackageSet(offset, count, callback) {
	//console.log("downloadPackageSet offset: " + offset + " count: " + count)
	
	var packageNames = []
	//console.log(__url)
	
	var url = __url + ((offset === 0) ? "" : "?offset=" + offset.toString())
	//console.log(url)
	
	request(url, function(error, response, html){
		if(!error) {
			var $ = cheerio.load(html)
			$(".name").each(function(){
				var name = $(this).html()
				packageNames.push(name)
			})
			
			for(var pkgCount = 0; pkgCount < count; pkgCount++) {
				let pkgName = packageNames[pkgCount]
				//console.log("pkgName: " + pkgName)
				
				let pathName = path.join(__dirname, 'packages', pkgName)
				//console.log("pkgCount: " + pkgCount + " pkgName: " + pkgName)
				
				request("http://registry.npmjs.org/{1}/latest".replace("{1}", pkgName), function(error, response, json) {
					
					if(error) {
						console.log("pkg request failed with: " + error)
					} else if (json) {
						//console.log(json)
						var pkg = JSON.parse(json)
						console.log("name: " + pkg.name + " tarball: " + pkg.dist.tarball)
						
						//request(pkg.dist.tarball).pipe(fs.createWriteStream(pathName))				
						request
							.get(pkg.dist.tarball)
							.on('error', function(err) {
								console.log("tarball request error: " + err)
							})
							.pipe(fs.createWriteStream(pathName))

						//console.log(pkgName)
						
						// Handle the special test case for lodash pkg
						if(pkgName === "lodash") {
							console.log("downloading lodash")
							download({
								// a npm tarball url will work
								url: pkg.dist.tarball,
								dir: path.join(__dirname, '/packages')
							}).then(() => {
								// console.log('file is now downloaded!');
								__semaphore--
							}).catch(err => {
								console.log('lodash file could not be downloaded properly');
								console.log(err)
								// let's count down anyway to release the semaphore
								__semaphore--
							});	
						} else {
							__semaphore--
						}						
					} else {
						console.log("request failed to return pkg " + response.request.uri)
						__semaphore--
					}
				})				
			}
		}
	})
}

function deleteFolderRecursive(path) {
  if (fs.existsSync(path)) {
    fs.readdirSync(path).forEach(function(file, index){
      var curPath = path + "/" + file
      if (fs.lstatSync(curPath).isDirectory()) { // recurse
        deleteFolderRecursive(curPath)
      } else { // delete file
        fs.unlinkSync(curPath)
      }
    })
    fs.rmdirSync(path)
  }
}
