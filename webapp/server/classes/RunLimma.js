function RunLimma (job_id) {
  Job.call(this, job_id);

  // NOTE: top_gene_count can be a string or a number
  var top_gene_count = this.job.args.top_gene_count;
  if (!top_gene_count) {
    throw "top_gene_count not defined";
  }
  if (isNaN(top_gene_count)) {
    throw "top_gene_count not a number: " + top_gene_count;
  }
  this.top_gene_count = parseInt(top_gene_count);

  // 	var contrast = Contrast.findOne({'_id':contrastId}, {list1:1,'name':1,'studyID':1,_id:0});
  this.contrast = Contrast.findOne(this.job.args.contrast_id);
  if (!this.contrast) {
    throw "invalid contrast_id";
  }

  // error checking for contrast
  if (this.contrast.list1.length < 3 ||
      this.contrast.list2.length < 3) {
    throw "not enough samples in contrast to estimate variance";
  }

  console.log('# of samples in each side of' , this.contrast.name,': ' ,
      this.contrast.list1.length, 'vs',this.contrast.list2.length);

  this.study = Studies.findOne({ id: this.contrast.studyID });
  if (!this.study) {
    throw "invalid studyID in contrast";
  }

  // This is the union of the samples in both lists in the contrast.
  // NOTE: set in writePhenoFile
  this.sampleList = {};
}
RunLimma.prototype = Object.create(Job.prototype);
RunLimma.prototype.constructor = RunLimma;

// Writes the phenotype file.
// Also sets this.sampleList which keeps track of the samples that are in
// either list1 or list2.
// NOTE: no attempt to avoid the internal Node buffer has been made
// here because this file shouldn't be long enough to need it.
RunLimma.prototype.writePhenoFile = function (filePath) {
  var self = this;

  var phenoWriteStream = fs.createWriteStream(filePath);
  phenoWriteStream.write( "sample\tgroup\n");
  _.each(this.contrast.list1, function(item) {
    phenoWriteStream.write(item);
    phenoWriteStream.write('\t');
    phenoWriteStream.write(self.contrast.group1);
    phenoWriteStream.write( '\n');
    self.sampleList[item] = 1;
  });
  _.each(this.contrast.list2, function(item) {
    phenoWriteStream.write(item);
    phenoWriteStream.write('\t');
    phenoWriteStream.write(self.contrast.group2);
    phenoWriteStream.write( '\n');
    self.sampleList[item] = 1;
  });

  var phenoDefer = Q.defer();
  phenoWriteStream.end(phenoDefer.resolve);
  return phenoDefer.promise;
};

// Writes the data in the expression file
// Does some cool stuff with promises to buffer writing to the disk.
RunLimma.prototype.writeExpressionFile = function (filePath) {
  var self = this;

  var writeStream = fs.createWriteStream(filePath);

  // write the header line
  writeStream.write('gene\t');
  _.map(this.sampleList, function(value, key) {
    if (value === 1) {
      writeStream.write(key);
      writeStream.write('\t');
    }
  });
  writeStream.write('\n');

  // get data for the rest of the file
  var fields = { gene: 1 };
  _.each(this.sampleList, function (value, key) {
    fields["samples." + key] = value;
  });
  var count = 0;
  var expressionCursor = Expression2.rawCollection().find(
      { Study_ID: this.study.id },
      { fields: fields });

  // set up helper functions to write the rest of the file
  //
  // The reason we need all these functions instead of just calling write a
  // bunch of times is because when write returns false, it's good practice
  // to wait for the 'drain' event from the stream, meaning the internal
  // buffer has been cleared and written to the disk. In practice, not
  // waiting for this event and calling write many times means that writing
  // becomes incredibly slow.
  //
  // https://nodejs.org/api/stream.html#stream_event_drain

  // expressionDeferred.resolve will be called when writeNextLine finds
  // the end of the expression cursor
  var expressionDeferred = Q.defer();

  function niceWrite(toWrite) {
    var keepWriting = writeStream.write(toWrite);
    if (keepWriting) {
      // return a promise that has already been resolved
      // any .then()s connected to this will fire immidiately
      return Q();
    }

    // waits until the stream has drained, then resolves
    return new Q.Promise(function (resolve) {
      writeStream.once("drain", resolve);
    });
  }

  function writeArray(arrayOfStrings) {
    // NOTE: The way I'm starting all of the writes here means there could
    // be multiple 'drain' events on writeStream. This is not a probelm
    // because in this context we're only calling writeArray with less than
    // 10 elements in arrayOfStrings.

    var arrayPromises = [];
    for (var index in arrayOfStrings) {
      arrayPromises.push(niceWrite(arrayOfStrings[index]));
    }
    return Q.all(arrayPromises);
  }

  function writeNextLine() {
    expressionCursor.nextObject(function (error, expressionDoc) {
      // check to see if we've found the end of the cursor
      if (!expressionDoc) {
        writeStream.end(expressionDeferred.resolve);
        return; // don't run the rest of the function
      }

      // actually write to the file
      var toWriteArray = [];
      toWriteArray.push(expressionDoc.gene);
      toWriteArray.push('\t');
      var sampleArray = []; // don't call write more than we need
      _.map(expressionDoc.samples, function(value, key) {
        if (self.sampleList[key] !== undefined) {
          geneExp = value.rsem_quan_log2;
          sampleArray.push(geneExp);
        }
      });
      toWriteArray.push(sampleArray.join('\t'));
      toWriteArray.push('\n');

      // write toWriteArray to the file, then write the next line
      writeArray(toWriteArray).then(writeNextLine);
    });
  }

  // start out the promise-based recursive looping through the cursor
  writeNextLine();

  return expressionDeferred.promise;
};

RunLimma.prototype.run = function () {
  var self = this;

  // create paths for files on the disk
  var workDir = ntemp.mkdirSync('RunLimma');
  console.log('workDir: ', workDir);

  // TODO: generate the file names in the functions themselves, then
  // hand them off through a Q.all().spread
  var phenoPath = path.join(workDir, 'pheno.tab');
  var expressionPath = path.join(workDir, 'expdata.tab');
  var sigPath = path.join(workDir, 'report', 'sig.tab');
  var topGenePath = path.join(workDir, 'report','topgene.tab');
  var plotPath = path.join(workDir, 'report','mds.pdf');


  var outerDeferred = Q.defer();
  self.writePhenoFile.call(self, phenoPath)
    .then(function () {
      console.log("done writing phenofile");
      return self.writeExpressionFile.call(self, expressionPath);
    })
    .then(function () {
      console.log("done writing expression file");

      var settings = Meteor.settings;
      if (!settings) {
        throw "No Meteor.settings file available";
      }
      if (!settings.limma_path) {
        throw "No limma_path defined in Meteor.settings file";
      }

      // TODO: Robert needs to set the 300 to something
      console.log("Meteor.settings.limma_path:", Meteor.settings.limma_path);
      return spawnCommand(Meteor.settings.limma_path,
        [expressionPath, phenoPath, 300, sigPath, topGenePath, plotPath],
        workDir);
    })
    .then(function () {
      console.log("done with command");

    //   var whendone = function(retcode, workDir, contrastId, contrastName, studyID, uid) {
		// 	var idList = [];
		// 	console.log('whendone work dir', workDir, 'return code', retcode, 'user id', uid);
		// 	var buf = fs.readFileSync(path.join(workDir,'report.list'), {encoding:'utf8'}).split('\n');
		// 	_.each(buf, function(item) {
		// 		if (item) {
		// 			var opts = {};
		// 			ext = path.extname(item).toString();
		// 			filename = path.basename(item).toString();
		// 			if (ext == '.xgmml')
		// 				opts.type = 'text/xgmml';
		// 			else if (ext == '.sif')
		// 				opts.type = 'text/network';
		// 			else if (ext == '.tab')
		// 				opts.type = 'text/tab-separated-values';
		// 			//else if (filename == 'genes.tab')
		// 			//	opts.type = ' Top Diff Genes'
		// 			else
		// 				opts.type = mime.lookup(item);
    //
		// 			var f = new FS.File();
		// 			f.attachData(item, opts);
    //
		// 			var blob = Blobs.insert(f);
		// 			console.log('name', f.name(),'blob id', blob._id, 'ext' , ext, 'type', opts.type, 'opts', opts, 'size', f.size());
		// 			if (f.name() == 'genes.tab') {
		// 				// Write signature object to MedBook
		// 				console.log('write gene signature');
		// 				var sig_lines = fs.readFileSync(item, {encoding:'utf8'}).split('\n');
		// 				var count = 0;
		// 				var sig_version = Signature.find({'contrast':contrastId}, {'version':1, sort: { version: -1 }}).fetch();
		// 				var version = 0.9;
		// 				var sigDict = {'AR' :{'weight':3.3}};
		// 				try {
		// 					version = Number(sig_version[0].version);
		// 				}
		// 				catch(error) {
		// 					version = 0.9;
		// 				}
		// 				console.log('previous signature version', version);
		// 				version = version + 0.1;
		// 				_.each(sig_lines, function(sig_line) {
		// 					var line = sig_line.split('\t');
    //
		// 					// logFC AveExpr t P.Value adj.P.Val B
		// 					gene = line[0];
		// 					fc = line[1];
		// 					aveExp = line[2];
		// 					tStat = line[3];
		// 					pVal = line[4];
		// 					adjPval = line[5];
		// 					Bstat = line[6];
		// 					if (gene) {
		// 						try {
		// 							sig = {};
		// 							//sig['name'] = gene
		// 							sig.weight = fc;
		// 							sig.pval = pVal;
		// 								sigDict[gene] = sig;
		// 							count += 1;
		// 							//if (count < 10) {
		// 							//	console.log(gene,fc, sig)
		// 								//}
		// 						}
		// 						catch (error) {
		// 							console.log('cannot insert signature for gene', gene, error);
		// 						}
		// 					}
		// 				});
		// 				var sigID = new Meteor.Collection.ObjectID();
		// 				var sigObj = Signature.insert({'_id':sigID, 'name':contrastName, 'studyID': studyID,
		// 					'version':version,'contrast':contrastId, 'signature':  sigDict });
		// 				console.log('signature insert returns', sigObj);
		// 			}
		// 			idList.push(blob._id);
		// 		}
		// 	}) ; /* each item in report.list */
		// 	var resObj = Results.insert({'contrast': contrastId,'type':'diff_expression', 'name':'differential results for '+contrastName,'studyID':studyID,'return':retcode, 'blobs':idList});
		// 	/* remove auto post
		// 	var post = {
		// 		title: "Results for contrast: "+contrastName,
		// 		url: "/wb/results/"+resObj,
		// 		body: "this is the results of limmma differential analysis run on 2/14/2015",
		// 		medbookfiles: idList
		// 	}
		// 	console.log('user is ',uid)
		// 	if (uid) {
		// 		var user = Meteor.users.findOne({_id:uid})
		// 		if (user) {
		// 			console.log('user.services', user.services)
		// 			var token = user.services.resume.loginTokens[0].hashedToken
		// 			console.log('before post',post, token, 'username', user.username)
		// 			HTTP.post("http://localhost:10001/medbookPost", {data:{post:post, token:token}})
		// 			console.log('after post')
		// 		}
		// 	}*/
		// 	//if (retcode == 0) {
		// 	//	ntemp.cleanup(function(err, stats) {
		// //			if (err)
		// //				console.log('error deleting temp files', err)
		// //			console.log('deleting temp files');
		// //	  	});
		// //	}
		// };  /* end of whendon */

      outerDeferred.resolve();
    })
    .catch(outerDeferred.reject);

  return outerDeferred.promise;
};

JobClasses.RunLimma = RunLimma;
