// This was committed by Robert on March 2. It seems to be mostly a copy of
// another job, and I (Teo) don't think it's ever been tested.

fs = Npm.require('fs');
function RunViper (job_id) {
  Job.call(this, job_id);

  // NOTE: top_gene_count can be a string or a number
  console.log('Run Viper with ',this.job.args);
  var top_gene_count = this.job.args.top_gene_count;
  var user_id = this.job.user_id
  this.email_address = Meteor.call('get_email', user_id);
  console.log('user id running job', user_id, this.email_address, 'args', this.job.args);
  if (!top_gene_count) {
    top_gene_count = 5000;
    //throw "top_gene_count not defined";
  }
  if (isNaN(top_gene_count)) {
    throw "top_gene_count not a number: " top_gene_count;
  }
  this.top_gene_count = parseInt(top_gene_count);
  if (this.job.args.correction) {
    this.correction = this.job.args.correction;
  }
  else {
    this.correction = "BH";
  }

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

  console.log('job', job_id, 'top gene count', top_gene_count, '# of samples in each side of' , this.contrast.name,': ' ,
      this.contrast.list1.length, 'vs',this.contrast.list2.length);

  this.study = Studies.findOne({ id: this.contrast.studyID });
  if (!this.study) {
    throw "invalid studyID in contrast";
  }

  // This is the union of the samples in both lists in the contrast.
  // NOTE: set in writePhenoFile
  this.sampleList = {};
}
RunViper.prototype = Object.create(Job.prototype);
RunViper.prototype.constructor = RunViper;

// Writes the phenotype file.
// Also sets this.sampleList which keeps track of the samples that are in
// either list1 or list2.
// NOTE: no attempt to avoid the internal Node buffer has been made
// here because this file shouldn't be long enough to need it.
RunViper.prototype.writePhenoFile = function (filePath) {
  // self = this #2
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
RunViper.prototype.writeExpressionFile = function (filePath) {
  // self = this #3
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
    fields["samples." key] = value;
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

RunViper.prototype.run = function () {
  // WHAT THIS HELL IS THIS AND SELF?????? EXPLAIN!!!!!!  self = this #1
  var self = this;

  // create paths for files on the disk
  var workDir = ntemp.mkdirSync('RunViper');
  console.log('workDir: ', workDir);

  // TODO: generate the file names in the functions themselves, then
  // hand them off through a Q.all().spread
  var phenoPath = path.join(workDir, 'pheno.tab');
  var expressionPath = path.join(workDir, 'expdata.tab');
  var networkPath = path.join(workDir, 'network.adj')
  var sigPath = path.join(workDir, 'model_fit.tab');
  var topGenePath = path.join(workDir, 'Topgene.tab');
  var outDir = path.join(workDir, 'output');
  var plotPath = path.join(workDir, 'mds.pdf');
  var voomPath = path.join(workDir, 'voom.pdf');
  var contrastName = this.contrast.name;
  var studyID = this.contrast.studyID;
  var contrastId = this.contrast._id;
  //console.log('contrastId', contrastId, this.contrast);
  fs.mkdir(outDir, function(err) {
    console.log('error creating output dir', err);
  });


  var outerDeferred = Q.defer();
  self.writePhenoFile.call(self, phenoPath)
    .then(function () {
      console.log("done writing phenofile");
      // more MAGIC this <> self because we are in the secret anonymous function chained callback for writePheonFile
      return self.writeExpressionFile.call(self, expressionPath);
    })
    .then(function () {
      console.log("done writing expression file");

      var settings = Meteor.settings;
      if (!settings) {
        throw "No Meteor.settings file available";
      }
      if (!settings.viper_path) {
        throw "No viper_path defined in Meteor.settings file";
      }

      // TODO: Robert needs to set the 300 to something
      console.log("Meteor.settings.viper_path:", Meteor.settings.viper_path);
        //output written to viperScores.txt
      //run-viper-supervised.R -e data/test.data.tab -p data/phenotypes.tab -n data/multinet.adj -t Tumor -r Normal --permutations 100 --output test-viper-supervised
      console.log('self args', self.job.args);
      return spawnCommand("Rscript",
        [Meteor.settings.viper_path,"-e",expressionPath, "-p",phenoPath, "-n", networkPath, "-t" , self.contrast.group1, "-r", self.contrast.group2, "--permutations", self.job.args.permutations, "--output", outDir],
        workDir);
    })
    .then(Meteor.bindEnvironment ( function (code) {
      console.log("done with command", code);

  		var idList = [];
      var blobList = [];
      var output_obj = {};
			//var buf = fs.readFileSync(path.join(workDir,'report.list'), {encoding:'utf8'}).split('\n');
      if (code != 0) {
  	  			var blob = Blobs.insert(code);
            blobList.push(blob._id);
      }
      else  {
      buf = [topGenePath, plotPath ];
		 	_.each(buf, function(item) {
		 		if (item) {
		 			var opts = {};
		 			ext = path.extname(item).toString();
		 			filename = path.basename(item).toString();
          console.log('filename', filename);
		 			if (ext == '.xgmml')
		 				opts.type = 'text/xgmml';
		 			else if (ext == '.sif')
		 				opts.type = 'text/network';
		 			else if (ext == '.tab')
		 				opts.type = 'text/tab-separated-values';
		 			else if (filename == 'Topgene.tab')
		 				opts.type = ' Top Diff Genes';
		 			else
		 			 	//opts.type = mime.lookup(item);
            //FIX ME add mime
            opts.type = 'undefind';

          console.log("creating FS.File");
		 			//var f = new FS.File();
		 			//f.attachData(item, opts);

	  			var blob = Blobs.insert(item);
          var my_user_id = self.job.user_id
          Blobs.update({_id:blob._id}, {$set:{"metadata.user_id":my_user_id}});
          blobList.push(blob._id);
		 			if (filename == 'Topgene.tab') {
		 				console.log('write signature from Topgene.tab');
            var sig_lines = fs.readFileSync(item, {encoding:'utf8'}).split('\n');
            var colheaders = ['Gene', 'Log Fold Change', 'Avg Expression','T stat','Pval', 'FDR','log odds'];
		 				var count = 0;
		 				var sig_version = Signatures.find({'contrast_id':self.contrast._id}, {'version':1, sort: { version: -1 }}).fetch();
		 				var version = 1;
            var sigArr = [];
		 				try {
		 					version = Number(sig_version[0].version);
		 				}
		 				catch(error) {
		 					version = 1;
		 				}
		 				console.log('previous signature version', version);
		 				version = version 1;
		 				_.each(sig_lines, function(sig_line) {
		 					var line = sig_line.split('\t');

	  					// logFC AveExpr t P.Value adj.P.Val B
							gene = line[0];
		 					fc = line[1];
		 					aveExp = line[2];
		 					tStat = line[3];
							pVal = line[4];
		 					adjPval = line[5];
		 					Bstat = line[6];
              probability = Math.exp(Bstat)/(1+Math.exp(Bstat));
		 					if (gene) {
		 						try {
                  if (adjPval < 0.25) {
                    sigArr.push({gene_id:gene, value:fc, p_value:adjPval, probability:probability});
  		 							count= 1;
                  }
		 							//if (count < 10) {
		 							//	console.log(gene,fc, sig)
		 								//}
		 						}
		 						catch (error) {
		 							console.log('cannot insert signature for gene', gene, error);
		 						}
		 					}
            })
            if (count == 0) {
              console.warn("No significant genes found in this contrast");
              Meteor.call('sendEmail',
                  self.email_address,
                  'MedBook: Viper job complete with warnings',
                  'Warning: No significant genes for this Contrast '+ contrastName+ ' click here for results.');
            }
            else {
              console.log(count,'significant genes found in this contrast');
              console.log('insert sig', 'contrast', self.contrast._id, 'version', version, 'name', contrastName, 'length of signature', sigArr.length);
  		 				var sigObj = Signatures.insert({'name':contrastName, 'studyID': studyID, 'label': contrastName, 'type': 'differential',
  		 					'version':version,'contrast_id':self.contrast._id, 'sparse_weights':  sigArr , 'description': 'Viper sig', 'algorithm': 'Viper'},
                function(err, res_id) {
                  if (err) {
                     console.log('insert error, ', err);
                     Meteor.Error("Cannot insert signature");
                  }
                  console.log('done inserting signature _id=', res_id);
                  Meteor.call('sendEmail',
                    self.email_address,
                    'MedBook: Viper job complete, successfully ',
                    count.toString()+ ' significant genes found for Contrast ', contrastName, 'click here for results.');

                  if (sigObj) {
                    output_obj.signature = res_id;
                  }
              });
            }
          }
		 			if (filename == 'model_fit.tab') {
		 				// Write signature object to MedBook
		 				console.log('ignore model fit from model_fit.tab');
            var colheaders = ['Gene','coeff.Intercept','coeff.contrastB','stdev','stdev.contrastB','sigma','df.residual','Amean','s2.post','t.Intercept','t.contrastB',	'df.total',	'p.val.Intercept','p.value.contrastB','lods.Intercept',	'lods.contrastB','F','F.p.value']
		 			}
		 		}
		 	}) ; /* each item in report.list */
      }
      if (blobList) {
          output_obj.blobs = blobList;
      }
      console.log('update job', output_obj);
		 	/* remove auto post
		 	var post = {
		    	title: "Results for contrast: "+contrastName,
		 		url: "/wb/results/"+resObj,
		 		body: "this is the results of limmma differential analysis run on 2/14/2015",
		 		medbookfiles: idList
		 	}
		 	if (uid) {
		 		var user = Meteor.users.findOne({_id:uid})
		 		if (user) {
		 			console.log('user.services', user.services)
		 			var token = user.services.resume.loginTokens[0].hashedToken
		 			console.log('before post',post, token, 'username', user.username)
		 			HTTP.post("http://localhost:10001/medbookPost", {data:{post:post, token:token}})
		 			console.log('after post')
		 		}
		 	}*/
		// 	//if (retcode == 0) {
		// 	//	ntemp.cleanup(function(err, stats) {
		// //			if (err)
		// //				console.log('error deleting temp files', err)
		// //			console.log('deleting temp files');
		// //	  	});
		// //	}
		// };  /* end of whendon */

      outerDeferred.resolve(output_obj);
    }, outerDeferred.reject))
    .catch(outerDeferred.reject);

  return outerDeferred.promise;
};

JobClasses.RunViper = RunViper;
