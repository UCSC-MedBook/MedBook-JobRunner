function RunGSEA (job_id) {
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
  // NOTE: set in writeRankedGeneList
  this.sampleList = {};
}
RunGSEA.prototype = Object.create(Job.prototype);
RunGSEA.prototype.constructor = RunGSEA;

// Writes the phenotype file.
// Also sets this.sampleList which keeps track of the samples that are in
// either list1 or list2.
// NOTE: no attempt to avoid the internal Node buffer has been made
// here because this file shouldn't be long enough to need it.
RunGSEA.prototype.writeRankedGeneList = function (filePath) {
  var self = this;

  var geneListWriteStream = fs.createWriteStream(filePath);
  geneListWriteStream.write( "# gene\tscore\n");
  _.each(this.signatures, function(item) {
    geneListWriteStream.write(item.gene_label);
    geneListWriteStream.write('\t');
    geneListWriteStream.write(item.value);
    geneListWriteStream.write( '\n');
    self.sampleList[item] = 1;
  });

  var geneListDefer = Q.defer();
  geneListWriteStream.end(geneListDefer.resolve);
  return geneListDefer.promise;
};

// Writes the data in the expression file
// Does some cool stuff with promises to buffer writing to the disk.
RunGSEA.prototype.writeGmtFile = function (filePath) {
  var self = this;

  var writeStream = fs.createWriteStream(filePath);

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

RunGSEA.prototype.run = function () {
  var self = this;

  // create paths for files on the disk
  var workDir = ntemp.mkdirSync('RunGSEA');
  console.log('workDir: ', workDir);

  // TODO: generate the file names in the functions themselves, then
  // hand them off through a Q.all().spread
  // ranked list of genes: col1: gene_label, col2: weight, col5: pvalue
  var rankedGenesPath = path.join(workDir, 'rankedGenes.rnk');
  //var gmtPath = path.join(workDir, 'geneSet.gmt');


  var outerDeferred = Q.defer();
  self.writeRankedGeneList.call(self, rankedGenesPath)
    .then(function () {
      console.log("done writing ranked gene list");
      return ;
    })
    .then(function () {
      console.log("done writing gmt file");

      var settings = Meteor.settings;
      if (!settings) {
        throw "No Meteor.settings file available";
      }
      if (!settings.GSEA_path) {
        throw "No GSEA_path defined in Meteor.settings file";
      }
      if (!settings.gsea_jar_path) {
        throw "No gsea_jar_path defined in Meteor.settings file";
      }
      if (!settings.gmt_path) {
        throw "No gmt_path defined in Meteor.settings file";
      }

      // TODO: Robert needs to set the 300 to something
      console.log("Meteor.settings.GSEA_path:", Meteor.settings.GSEA_path);
      return spawnCommand(Meteor.settings.GSEA_path,\
        ["--input_tab", rankedGenesPath, "--builtin_gmt", gmt_path, "--gsea_jar", gsea_jar_path, \
      "--adjpvalcol", "5" ,"--signcol", "2" "--idcol", "1",\
      "--outhtml", "index.html",\
      "--input_name", "contrast name",\
      "--setMax", "500", "--setMin", "15", "--nPerm", "1000" ,"--plotTop", "20",\
      "--output_dir", workDir, \
      "--mode", "Max_probe",\
      "--title", "contrast name" ],
        workDir);
    })
    .then(function () {
      console.log("done with GSEA");

      outerDeferred.resolve();
    })
    .catch(outerDeferred.reject);

  return outerDeferred.promise;
};

JobClasses.RunGSEA = RunGSEA;
