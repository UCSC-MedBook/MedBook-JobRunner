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

  console.log("copyNumberSelector:", copyNumberSelector);
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

  // write the header line
  writeStream.write('Gene\t');
  _.map(sampleLabels, function(value, key) {
    writeStream.write(value);
    writeStream.write('\t');
  });
  writeStream.write('\n');

  var deferred = Q.defer();
  writeStream.end(deferred.resolve);
  return deferred.promise;

  // // get data for the rest of the file
  // var fields = { gene: 1 };
  // _.each(this.sampleList, function (value, key) {
  //   fields["samples." + key] = value;
  // });
  // var count = 0;
  // var copyNumberCursor = CopyNumber.rawCollection()
  //     .find(copyNumberSelector);
  //
  // // set up helper functions to write the rest of the file
  // //
  // // The reason we need all these functions instead of just calling write a
  // // bunch of times is because when write returns false, it's good practice
  // // to wait for the 'drain' event from the stream, meaning the internal
  // // buffer has been cleared and written to the disk. In practice, not
  // // waiting for this event and calling write many times means that writing
  // // becomes incredibly slow.
  // //
  // // https://nodejs.org/api/stream.html#stream_event_drain
  //
  // // expressionDeferred.resolve will be called when writeNextLine finds
  // // the end of the expression cursor
  // var expressionDeferred = Q.defer();
  //
  // function niceWrite(toWrite) {
  //   var keepWriting = writeStream.write(toWrite);
  //   if (keepWriting) {
  //     // return a promise that has already been resolved
  //     // any .then()s connected to this will fire immidiately
  //     return Q();
  //   }
  //
  //   // waits until the stream has drained, then resolves
  //   return new Q.Promise(function (resolve) {
  //     writeStream.once("drain", resolve);
  //   });
  // }
  //
  // function writeArray(arrayOfStrings) {
  //   // NOTE: The way I'm starting all of the writes here means there could
  //   // be multiple 'drain' events on writeStream. This is not a probelm
  //   // because in this context we're only calling writeArray with less than
  //   // 10 elements in arrayOfStrings.
  //
  //   var arrayPromises = [];
  //   for (var index in arrayOfStrings) {
  //     arrayPromises.push(niceWrite(arrayOfStrings[index]));
  //   }
  //   return Q.all(arrayPromises);
  // }
  //
  // function writeNextLine() {
  //   expressionCursor.nextObject(function (error, expressionDoc) {
  //     // check to see if we've found the end of the cursor
  //     if (!expressionDoc) {
  //       writeStream.end(expressionDeferred.resolve);
  //       return; // don't run the rest of the function
  //     }
  //
  //     // actually write to the file
  //     var toWriteArray = [];
  //     toWriteArray.push(expressionDoc.gene);
  //     toWriteArray.push('\t');
  //     var sampleArray = []; // don't call write more than we need
  //     _.map(expressionDoc.samples, function(value, key) {
  //       if (self.sampleList[key] !== undefined) {
  //         geneExp = value.rsem_quan_log2;
  //         sampleArray.push(geneExp);
  //       }
  //     });
  //     toWriteArray.push(sampleArray.join('\t'));
  //     toWriteArray.push('\n');
  //
  //     // write toWriteArray to the file, then write the next line
  //     writeArray(toWriteArray).then(writeNextLine);
  //   });
  // }
  //
  // // start out the promise-based recursive looping through the cursor
  // writeNextLine();
  //
  // return expressionDeferred.promise;
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
      console.log("done writing file!");

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

      console.log("about to resolve");
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

JobClasses.ExportFile = ExportFile;
