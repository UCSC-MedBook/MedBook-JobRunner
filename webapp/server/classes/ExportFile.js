function ExportFile (job_id) {
  Job.call(this, job_id);

  this.exportedFile = ExportedFiles.findOne(this.job.args.exported_file_id);
  if (!this.exportedFile) {
    throw "Invalid exported_file_id";
  }
}
ExportFile.prototype = Object.create(Job.prototype);
ExportFile.prototype.constructor = ExportFile;
// Writes the data in the expression file
// Does some cool stuff with promises to buffer writing to the disk.
ExportFile.prototype.writeCopyNumberFile = function (filePath) {
  var self = this;

  var writeStream = fs.createWriteStream(filePath);

  var copyNumberSelector = {
    collaborations: {$in: this.exportedFile.collaborations}
  };

  console.log("aggregating data:", copyNumberSelector);
  var aggregationResult = CopyNumber.aggregate([
      {$match: copyNumberSelector},
      {
        $project: { // equivalent to 'fields' in collection.find
          sample_label: 1,
          gene_label: 1,
        }
      },
      {
        $group: {
          _id: null,
          sampleLabels: {$addToSet: "$sample_label"},
          geneLabels: {$addToSet: "$gene_label"},
        }
      },
    ])[0];
  if (!aggregationResult) {
    throw "no results";
  }
  var sampleLabels = aggregationResult.sampleLabels;
  var geneLabels = aggregationResult.geneLabels;
  sampleLabels.sort();
  geneLabels.sort();
  console.log("done aggregating data... starting to write");

  // write the header line
  writeStream.write('Gene\t');
  _.map(sampleLabels, function(value, key) {
    writeStream.write(value);
    writeStream.write('\t');
  });
  writeStream.write('\n');

  // get data for the rest of the file
  var fields = { gene: 1 };
  _.each(this.sampleList, function (value, key) {
    fields["samples." + key] = value;
  });
  var count = 0;
  var copyNumberCursor = CopyNumber.rawCollection()
      .find(copyNumberSelector);

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

  // deferred.resolve will be called when writeNextLine finds
  // the end of the expression cursor
  var deferred = Q.defer();

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

  // // for testing
  // geneLabels = ['TLR4'];
  // geneLabels = geneLabels.slice(0, 100);

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

  var geneIndex = 0;
  function writeNextLine() {
    // check to see if we should stop
    if (geneIndex >= geneLabels.length) {
      writeStream.end(deferred.resolve);
      return; // don't run the rest of the function
    }

    var gene_label = geneLabels[geneIndex];
    if (geneIndex % 1000 === 0) {
      console.log("geneIndex:", geneIndex);
    }
    geneIndex++;

    CopyNumber.rawCollection()
      .find({
        gene_label: gene_label
      }, {
        sample_label: 1,
        value: 1,
      })
      .sort({sample_label: 1})
      .toArray(function (error, docArray) {
        var valueArray = _.pluck(docArray, 'value');
        var toWriteArray = [
          gene_label,
          '\t',
          valueArray.join('\t'),
          '\n'
        ];
        writeArray(toWriteArray).then(writeNextLine);
      });
  }

  // start out the promise-based recursive looping through the cursor
  writeNextLine();

  return deferred.promise;
};
ExportFile.prototype.run = function () {
  var self = this;

  // create paths for files on the disk
  var workDir = ntemp.mkdirSync('RunLimma');
  var copyNumberFilePath = path.join(workDir, 'copy_number_export.tsv');
  console.log('workDir: ', workDir);

  var deferred = Q.defer();
  this.writeCopyNumberFile.call(this, copyNumberFilePath)
    .then(Meteor.bindEnvironment(function () {
      var blob = Blobs.insert(copyNumberFilePath);
      if (!self.job.user_id) {
        throw "self.job.user_id not set";
      }
      Blobs.update(blob._id, {
        metadata: {
          user_id: self.job.user_id,
        }
      });

      // we did it!
      ExportedFiles.update(self.exportedFile._id, {
        $set: {
          status: "done",
          blob_id: blob._id,
          blob_name: blob.original.name,
        }
      });

      deferred.resolve();
    }, deferred.reject));

  return deferred.promise;
};
ExportFile.prototype.onError = function (e) {
  ExportedFiles.update(this.job.args.exported_file_id, {
    $set: {
      status: "error",
      error_description: "Error running job: " + e.toString(),
    }
  });
};

// TODO: print if we're actually going to create one
CopyNumber.rawCollection().ensureIndex({
  gene_label: 1
}, function (error, result) {
  console.log("created index for copy_number");
  console.log("error:", error);
  console.log("result:", result);
});

JobClasses.ExportFile = ExportFile;
