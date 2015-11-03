var ntemp = Meteor.npmRequire('temp').track();
var path = Npm.require('path');
var fs = Npm.require('fs');
var spawn = Npm.require('child_process').spawn;

function Job (job_id) {
  this.job = Jobs.findOne(job_id);
  if (!this.job) {
    throw "Invalid job_id";
  }

  this.reasonForRetry = false;
}
Job.prototype.run = function() {
  console.log("no run function defined");
};
Job.prototype.retry = function(reasonForRetry) {
  // TODO: this needs documentation big time... or maybe needs to be changed...
  if (!reasonForRetry) {
    reasonForRetry = "unknown reason";
  }
  console.log("setting reasonForRetry to", reasonForRetry);
  this.reasonForRetry = reasonForRetry;
};
Job.prototype.onError = function(e) {
  console.log("No onError function defined");
};
Job.prototype.onSuccess = function () {
  console.log("No onSuccess function defined");
};


function ensureWranglerFileIntegrity() {
  this.wranglerFile = WranglerFiles.findOne(this.job.args.wrangler_file_id);
  if (!this.wranglerFile) {
    throw "Invalid wrangler_file_id";
  }

  this.blob = Blobs.findOne(this.wranglerFile.blob_id);
  if (this.blob) {
    if (!this.blob.hasStored("blobs")) {
      this.retry("blob hasn't stored yet");
    }
  } else {
    throw "Invalid blob_id";
  }
}


function ParseWranglerFile (job_id) {
  Job.call(this, job_id);

  ensureWranglerFileIntegrity.call(this);
}
ParseWranglerFile.prototype = Object.create(Job.prototype);
ParseWranglerFile.prototype.constructor = ParseWranglerFile;
function setBlobTextSample () {
  var deferred = Q.defer();

  var self = this;
  var blob_text_sample = "";
  var lineNumber = 0;
  var characters = 250;
  var lines = 5;

  var bylineStream = byLine(this.blob.createReadStream("blobs"));
  bylineStream.on('data', Meteor.bindEnvironment(function (lineObject) {
    lineNumber++;
    if (lineNumber <= lines) {
      blob_text_sample += lineObject.toString().slice(0, characters) + "\n";

      if (lineNumber === lines) {
        WranglerFiles.update(self.wranglerFile._id, {
          $set: {
            blob_text_sample: blob_text_sample
          }
        });
      }
    }
  }));
  bylineStream.on('end', Meteor.bindEnvironment(function () {
    WranglerFiles.update(self.wranglerFile._id, {
      $set: {
        blob_line_count: lineNumber
      }
    });
    deferred.resolve();
  }));

  return deferred.promise;
}
ParseWranglerFile.prototype.run = function () {
  var self = this;

  WranglerFiles.update(this.wranglerFile._id, {
    $set: {
      status: "processing",
    },
    $unset: {
      error_description: true,
    }
  });

  // set blob_text_sample
  // NOTE: this is an async function
  var textSamplePromise;
  if (!this.wranglerFile.blob_text_sample) {
    textSamplePromise = setBlobTextSample.call(this);
  }

  // try to guess options that have not been manually specified
  var options = self.wranglerFile.options;
  if (options === undefined) {
    options = {};
  }
  function setFileOptions(newOptions) {
    _.extend(options, newOptions); // keeps `options` up to doate
    WranglerFiles.update(self.wranglerFile._id, {
      $set: {
        "options": options
      }
    });
  }

  // for guesses of file name
  var blobName = self.blob.original.name;
  function extensionEquals(extension) {
    return blobName.slice(-extension.length) === extension;
  }

  // try to guess file_type
  if (!options.file_type) {
    if (extensionEquals(".vcf")) {
      setFileOptions({ file_type: "MutationVCF" });
    }
    if (blobName.match(/\.rsem\.genes\.[a-z_]*\.tab/g)) {
      setFileOptions({ file_type: "BD2KGeneExpression" });
    }
    if (extensionEquals(".xls") || extensionEquals("xlsx")) {
      setFileOptions({ file_type: "BasicClinical" });
    }
  }

  // try to guess normalization
  if (!options.normalization) {
    // try to guess normalization
    if (blobName.match(/raw_counts/g)) {
      setFileOptions({ normalization: "raw_counts" });
    } else if (blobName.match(/norm_counts/g)) {
      setFileOptions({ normalization: "counts" });
    } else if (blobName.match(/norm_tpm/g)) {
      setFileOptions({ normalization: "tpm" });
    } else if (blobName.match(/norm_fpkm/g)) {
      setFileOptions({ normalization: "fpkm" });
    }
  }

  // force certain options
  if (options.file_type === "TCGAGeneExpression") {
    setFileOptions({ normalization: "counts" });
  }

  // we can now show the options to the user
  WranglerFiles.update(this.wranglerFile._id, {
    $set: { parsed_options_once_already: true }
  });

  // make sure we've got a file_type
  if (!options.file_type) {
    WranglerFiles.update(this.wranglerFile._id, {
      $set: {
        error_description: "File type could not be inferred. " +
            "Please manually select a file type"
      }
    });
    return;
  }

  var fileHandlerClass = WranglerFileTypes[options.file_type];
  if (!fileHandlerClass) {
    throw "file handler not yet defined (" + options.file_type + ")";
  }

  // figure out which FileHandler to create
  var fileHandler = new fileHandlerClass(self.wranglerFile._id, true);

  if (textSamplePromise) {
    var deferred = Q.defer();
    textSamplePromise
      .then(Meteor.bindEnvironment(function () {
        return fileHandler.parse();
      }, deferred.reject))
      .then(function () {
        deferred.resolve();
      })
      .catch(deferred.reject);
    return deferred.promise;
  } else {
    return fileHandler.parse();
  }
};
ParseWranglerFile.prototype.onError = function (error) {
  var error_description = error.toString();
  var status = "done";
  if (error.stack) {
    error_description = "Internal error encountered while parsing file";
    status = "error";
  }

  WranglerFiles.update(this.job.args.wrangler_file_id, {
    $set: {
      status: status,
      error_description: error_description,
    }
  });
};
ParseWranglerFile.prototype.onSuccess = function (result) {
  WranglerFiles.update(this.wranglerFile._id, {
    $set: {
      status: "done",
    }
  });
};


function SubmitWranglerFile (job_id) {
  Job.call(this, job_id);

  ensureWranglerFileIntegrity.call(this);
}
SubmitWranglerFile.prototype = Object.create(Job.prototype);
SubmitWranglerFile.prototype.constructor = SubmitWranglerFile;
SubmitWranglerFile.prototype.run = function () {
  // figure out which FileHandler to create
  var fileHandler = new WranglerFileTypes[this.wranglerFile.options.file_type]
      (this.wranglerFile._id, false);
  return fileHandler.parse();
};
SubmitWranglerFile.prototype.onError = function (e) {
  // TODO: should this be the correct behaviour?
  console.log("How can we have an onError in SubmitWranglerFile after going " +
      "through ParseWranglerFile...");
  var wranglerFile = WranglerFiles.findOne(this.job.args.wrangler_file_id);
  WranglerSubmissions.update(wranglerFile.submission_id, {
    $set: {
      status: "editing"
    },
    $addToSet: {
      errors: "Error running write job: " + e,
    }
  });
};
SubmitWranglerFile.prototype.onSuccess = function (result) {
  WranglerFiles.update(this.wranglerFile._id, {
    $set: {
      written_to_database: true,
    }
  });
};


function SubmitWranglerSubmission (job_id) {
  Job.call(this, job_id);

  this.submission = WranglerSubmissions.findOne(this.job.args.submission_id);
  if (!this.submission) {
    throw "Invalid submission_id";
  }
}
SubmitWranglerSubmission.prototype = Object.create(Job.prototype);
SubmitWranglerSubmission.prototype.constructor = SubmitWranglerSubmission;
SubmitWranglerSubmission.prototype.run = function () {
  var submission_id = this.submission._id;

  // remove all previous submission errors
  WranglerSubmissions.update(submission_id, { $set: { "errors": [] } });
  var errorCount = 0; // increased with addSubmissionError

  // define some helper functions
  function addSubmissionError (description) {
    if (errorCount < 25) {
      WranglerSubmissions.update(submission_id, {
        $addToSet: {
          "errors": description,
        }
      });
    }

    if (errorCount === 0) { // no need to set it twice
      WranglerSubmissions.update(submission_id, {$set: {"status": "editing"}});
    }
    errorCount++;
  }

  // make sure there are some files
  if (WranglerFiles
      .find({submission_id: submission_id})
      .count() === 0) {
    return addSubmissionError("No files uploaded");
  }

  // make sure each file is "done" and don't have error_description defined
  WranglerFiles.find({submission_id: submission_id}).forEach(function (doc) {
    if (doc.status !== "done") {
      addSubmissionError("File not done: " + doc.blob_name);
    } else if (doc.error_description) {
      addSubmissionError(doc.blob_name + " has a problem: " +
          doc.error_description);
    }
  });
  if (errorCount !== 0) {
    return;
  }

  // make sure there are some documents
  // NOTE: I'm assuming we have to have documents...
  if (WranglerDocuments
      .find({submission_id: submission_id})
      .count() === 0) {
    return addSubmissionError("No documents present");
  }

  // make sure we have only one type of submission type
  var distinctSubmissionTypes = WranglerDocuments.aggregate([
        {$match: {submission_id: submission_id}},
        {$project: {submission_type: 1}},
        {
          $group: {
            _id: null,
            distinct_submission_types: {$addToSet: "$submission_type"}
          }
        },
      ])[0]
      .distinct_submission_types;
  if (distinctSubmissionTypes.length !== 1) {
    return addSubmissionError("Mixed submission types");
  }

  // we have successfully verified that the submission is ready for writing!
  WranglerSubmissions.update(this.job.args.submission_id, {
    $set: {
      status: "writing"
    }
  });

  // add a bunch of jobs to write the files to the database
  var self = this;
  var writingJobIds = [];
  WranglerFiles.find({submission_id: submission_id})
      .forEach(function (wranglerFile) {
    var newJobId = Jobs.insert({
      name: "SubmitWranglerFile",
      user_id: self.job.user_id,
      date_created: new Date(),
      args: {
        wrangler_file_id: wranglerFile._id,
      },
      prerequisite_job_id: [self.job._id],
    });
    writingJobIds.push(newJobId);
  });

  // add a job to set the submission as finished
  var allPrerequisites = writingJobIds.concat([self.job._id]);
  Jobs.insert({
    name: "FinishWranglerSubmission",
    user_id: self.job.user_id,
    date_created: new Date(),
    args: {
      submission_id: submission_id,
    },
    prerequisite_job_id: allPrerequisites,
  });
};
SubmitWranglerSubmission.prototype.onError = function (e) {
  WranglerSubmissions.update(this.job.args.submission_id, {
    $set: {
      status: "editing",
      errors: [
        "Error running job: " + e.toString(),
      ],
    }
  });
};


function FinishWranglerSubmission (job_id) {
  Job.call(this, job_id);

  this.submission = WranglerSubmissions.findOne(this.job.args.submission_id);
  if (!this.submission) {
    throw "Invalid submission_id";
  }
}
FinishWranglerSubmission.prototype = Object.create(Job.prototype);
FinishWranglerSubmission.prototype.constructor = FinishWranglerSubmission;
FinishWranglerSubmission.prototype.run = function () {
  var submission_id = this.submission._id;

  // make sure there are no errors defined
  var errors = this.submission.errors;
  if (errors && errors.length > 0) {
    return;
  }

  // make sure the status is writing
  if (this.submission.status !== "writing") {
    WranglerSubmissions.update({
      $set: {
        status: "editing"
      },
      $addToSet: {
        errors: "Submission status not writing when trying to set as done"
      }
    });
  }

  // make sure each WranglerFile has { written_to_database: true }
  var notWrittenCursor = WranglerFiles.find({
    submission_id: submission_id,
    written_to_database: {$ne: true},
  });
  if (notWrittenCursor.count() > 0) {
    this.retry("files not done being written");
    return;
  }

  // we did it!
  WranglerSubmissions.update(this.job.args.submission_id, {
    $set: {
      status: "done"
    }
  });
};
FinishWranglerSubmission.prototype.onError = function (e) {
  WranglerSubmissions.update(this.job.args.submission_id, {
    $set: {
      status: "editing",
      errors: [
        "Error running job: " + e.toString(),
      ],
    }
  });
};


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

  this.study = Studies.findOne({ id: this.contrast.studyID });
  if (!this.study) {
    throw "invalid studyID in contrast";
  }
}
RunLimma.prototype = Object.create(Job.prototype);
RunLimma.prototype.constructor = RunLimma;
RunLimma.prototype.run = function () {
  var self = this;
  // console.log("Meteor.settings:", Meteor.settings);

  // error checking for contrast
  if (this.contrast.list1.length < 3 ||
      this.contrast.list2.length < 3) {
    throw "not enough samples in contrast to estimate variance";
  }
  console.log('# of samples in each side of' , this.contrast.name,': ' ,
      this.contrast.list1.length, 'vs',this.contrast.list2.length);

  // TODO: do we need this?
  var sampleList =  {'_id':0};
	var sampleList2 =  {'_id':0};

  // creates phenotype file and writes it
  function writePhenoFile(filePath) {
    var phenoDeferred = Q.defer();

    var phenoWriteStream = fs.createWriteStream(filePath);
  	phenoWriteStream.write( "sample\tgroup\n");
  	_.each(self.contrast.list1, function(item) {
  		phenoWriteStream.write(item);
  		sampleList[item] = 1;
  		phenoWriteStream.write('\t');
  		phenoWriteStream.write(self.contrast.group1);
  		phenoWriteStream.write( '\n');
  	});
  	_.each(self.contrast.list2, function(item) {
  		phenoWriteStream.write(item);
  		sampleList[item] = 1;
  		phenoWriteStream.write('\t');
  		phenoWriteStream.write(self.contrast.group2);
  		phenoWriteStream.write( '\n');
  	});
  	phenoWriteStream.end();
    self.sampleList = sampleList;
    //console.log(self.sampleList) ;

    phenoWriteStream
      .on("error", phenoDeferred.reject)
      .on("finish", phenoDeferred.resolve);

    return phenoDeferred.promise;
  }

  // creates expression file and writes it
  function writeExpressionFile(filePath) {
    var expressionDeferred = Q.defer();

    var expressionWriteStream = fs.createWriteStream(filePath);

    console.log('expresssion2.find Study_ID:'+self.study.id);
    var exp_curs = Expression2.find({Study_ID:self.study.id});
  	//var fd = fs.openSync(expfile,'w');
  	expressionWriteStream.write('gene\t');
  	_.map(sampleList, function(value, key) {

      if (value ==1 ) {
  	 			expressionWriteStream.write(key);
  	 			expressionWriteStream.write('\t');
      }
    });
  	expressionWriteStream.write('\n');
  	console.log('exp count' , exp_curs.count());
  	console.log('samplelist:');
  	console.log(self.sampleList);

  	exp_curs.forEach(function(exp) {
        var sampleArray = [];

  	 		expressionWriteStream.write(exp.gene);
  	 		expressionWriteStream.write('\t');
  	 		_.map(exp.samples, function(value, key) {
          if (self.sampleList[key] !== undefined) {
      	 	  geneExp = value.rsem_quan_log2;
            sampleArray.push(geneExp);
  	 				//expressionWriteStream.write(geneExp+'');
  	 				//expressionWriteStream.write('\t');
            }
        });
  	 		expressionWriteStream.write(sampleArray.join('\t'));
  	 		expressionWriteStream.write('\n');
  		});

  	 	console.log('end of file');
  	  expressionWriteStream.end();
  	 	fs.exists(filePath, function(data) {
  	 		console.log('file',	 filePath, 'exists?', data );
  	 	});


    expressionWriteStream
      .on("error", expressionDeferred.reject)
      .on("finish", expressionDeferred.resolve);

    return expressionDeferred.promise;
    }



  // create paths for files on the disk
  var workDir = ntemp.mkdirSync('RunLimma');
  console.log('workDir'+workDir);
  var phenoPath = path.join(workDir, 'pheno.tab');
  var expressionPath = path.join(workDir, 'expdata.tab');

  var deferred = Q.defer();
  Q.all([writePhenoFile(phenoPath), writeExpressionFile(expressionPath)])
      .done(function (resolvedValues) {
    console.log("done writing!");
    console.log("phenoPath:", phenoPath);
    deferred.resolve();
  });

  return deferred.promise;


  //
	// 	var cmd = medbook_config.tools.limma.path;
	// 	var whendone = function(retcode, workDir, contrastId, contrastName, studyID, uid) {
	// 		var idList = [];
	// 		console.log('whendone work dir', workDir, 'return code', retcode, 'user id', uid);
	// 		var buf = fs.readFileSync(path.join(workDir,'report.list'), {encoding:'utf8'}).split('\n');
	// 		_.each(buf, function(item) {
	// 			if (item) {
	// 				var opts = {};
	// 				ext = path.extname(item).toString();
	// 				filename = path.basename(item).toString();
	// 				if (ext == '.xgmml')
	// 					opts.type = 'text/xgmml';
	// 				else if (ext == '.sif')
	// 					opts.type = 'text/network';
	// 				else if (ext == '.tab')
	// 					opts.type = 'text/tab-separated-values';
	// 				//else if (filename == 'genes.tab')
	// 				//	opts.type = ' Top Diff Genes'
	// 				else
	// 					opts.type = mime.lookup(item);
  //
	// 				var f = new FS.File();
	// 				f.attachData(item, opts);
  //
	// 				var blob = Blobs.insert(f);
	// 				console.log('name', f.name(),'blob id', blob._id, 'ext' , ext, 'type', opts.type, 'opts', opts, 'size', f.size());
	// 				if (f.name() == 'genes.tab') {
	// 					// Write signature object to MedBook
	// 					console.log('write gene signature');
	// 					var sig_lines = fs.readFileSync(item, {encoding:'utf8'}).split('\n');
	// 					var count = 0;
	// 					var sig_version = Signature.find({'contrast':contrastId}, {'version':1, sort: { version: -1 }}).fetch();
	// 					var version = 0.9;
	// 					var sigDict = {'AR' :{'weight':3.3}};
	// 					try {
	// 						version = Number(sig_version[0].version);
	// 					}
	// 					catch(error) {
	// 						version = 0.9;
	// 					}
	// 					console.log('previous signature version', version);
	// 					version = version + 0.1;
	// 					_.each(sig_lines, function(sig_line) {
	// 						var line = sig_line.split('\t');
  //
	// 						// logFC AveExpr t P.Value adj.P.Val B
	// 						gene = line[0];
	// 						fc = line[1];
	// 						aveExp = line[2];
	// 						tStat = line[3];
	// 						pVal = line[4];
	// 						adjPval = line[5];
	// 						Bstat = line[6];
	// 						if (gene) {
	// 							try {
	// 								sig = {};
	// 								//sig['name'] = gene
	// 								sig.weight = fc;
	// 								sig.pval = pVal;
	// 									sigDict[gene] = sig;
	// 								count += 1;
	// 								//if (count < 10) {
	// 								//	console.log(gene,fc, sig)
	// 									//}
	// 							}
	// 							catch (error) {
	// 								console.log('cannot insert signature for gene', gene, error);
	// 							}
	// 						}
	// 					});
	// 					var sigID = new Meteor.Collection.ObjectID();
	// 					var sigObj = Signature.insert({'_id':sigID, 'name':contrastName, 'studyID': studyID,
	// 						'version':version,'contrast':contrastId, 'signature':  sigDict });
	// 					console.log('signature insert returns', sigObj);
	// 				}
	// 				idList.push(blob._id);
	// 			}
	// 		}) ; /* each item in report.list */
	// 		var resObj = Results.insert({'contrast': contrastId,'type':'diff_expression', 'name':'differential results for '+contrastName,'studyID':studyID,'return':retcode, 'blobs':idList});
	// 		/* remove auto post
	// 		var post = {
	// 			title: "Results for contrast: "+contrastName,
	// 			url: "/wb/results/"+resObj,
	// 			body: "this is the results of limmma differential analysis run on 2/14/2015",
	// 			medbookfiles: idList
	// 		}
	// 		console.log('user is ',uid)
	// 		if (uid) {
	// 			var user = Meteor.users.findOne({_id:uid})
	// 			if (user) {
	// 				console.log('user.services', user.services)
	// 				var token = user.services.resume.loginTokens[0].hashedToken
	// 				console.log('before post',post, token, 'username', user.username)
	// 				HTTP.post("http://localhost:10001/medbookPost", {data:{post:post, token:token}})
	// 				console.log('after post')
	// 			}
	// 		}*/
	// 		//if (retcode == 0) {
	// 		//	ntemp.cleanup(function(err, stats) {
	// 	//			if (err)
	// 	//				console.log('error deleting temp files', err)
	// 	//			console.log('deleting temp files');
	// 	//	  	});
	// 	//	}
	// 	};  /* end of whendon */
  //
	// 	Meteor.call('runshell', {{get from Meteor.settings.limma_path}}, [expfile,phenofile, '200', 'sig.tab', 'genes.tab', 'mds.pdf'],
	// 		workDir, contrastId, contrastName, studyID, path.join(workDir,'report.list'), whendone, function(err,response) {
	// 			if(err) {
	// 				console.log('serverDataResponse', "pathmark_adapter Error:" + err);
	// 				return ;
	// 			}
	// 	resultObj = response.stderr;
	// 	console.log('limma started stdout stream id: '+resultObj._id+ ' stdout name '+resultObj.name());
	// 	var readstream = resultObj.createReadStream('blobs');
	// 	readstream.setEncoding('utf8');
	// 	readstream.on('data', function(chunk) {
	// 		console.log('chunk', chunk);
	// 	});
	// });
};
RunLimma.prototype.onError = function (error) {
  console.log("onError");
};
RunLimma.prototype.onSuccess = function (result) {
  console.log("onSuccess");
};


JobClasses = {
  // usable classes (extend from Job)
  ParseWranglerFile: ParseWranglerFile,
  SubmitWranglerFile: SubmitWranglerFile,
  SubmitWranglerSubmission: SubmitWranglerSubmission,
  FinishWranglerSubmission: FinishWranglerSubmission,
  RunLimma: RunLimma,
};
