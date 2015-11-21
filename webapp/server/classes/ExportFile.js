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

  // header line
  var headerLine = 'Gene\t';
  _.map(sampleLabels, function (value) {
    headerLine += value + '\t';
  });
  headerLine += '\n';
  var fileArray = [headerLine];

  // write rest of file
  for (var geneIndex = 0; geneIndex < geneLabels.length; geneIndex++) {
    if (geneIndex % 1000 === 0) console.log("geneIndex:", geneIndex);

    var gene_label = geneLabels[geneIndex];

    var docArray = CopyNumber.find({
        gene_label: gene_label
      }, {
        fields: { value: 1, sample_label: 1 },
        sort: { sample_label: 1 }
      })
      .fetch();

    var valueArray = _.pluck(docArray, 'value');
    fileArray.push(gene_label + '\t' + valueArray.join('\t') + '\n');
  }

  var deferred = Q.defer();
  fs.writeFile(filePath, fileArray.join(','), function (error, result) {
    if (error) {
      deferred.reject(error);
    } else {
      deferred.resolve(result);
    }
  });
  return deferred.promise;
};
ExportFile.prototype.run = function () {
  console.log("don't forget to put back in the indexes");
  throw 'taken out pending the updating of CopyNumber schema';


  // var self = this;
  //
  // // create paths for files on the disk
  // var workDir = ntemp.mkdirSync('RunLimma');
  // var copyNumberFilePath = path.join(workDir, 'copy_number_export.tsv');
  // console.log('workDir: ', workDir);
  //
  // var deferred = Q.defer();
  // this.writeCopyNumberFile.call(this, copyNumberFilePath)
  //   .then(Meteor.bindEnvironment(function () {
  //     var blob = Blobs.insert(copyNumberFilePath);
  //     if (!self.job.user_id) {
  //       throw "self.job.user_id not set";
  //     }
  //
  //     Blobs.update(blob._id, {
  //       metadata: {
  //         user_id: self.job.user_id,
  //       }
  //     });
  //
  //     // we did it!
  //     ExportedFiles.update(self.exportedFile._id, {
  //       $set: {
  //         status: "done",
  //         blob_id: blob._id,
  //         blob_name: blob.original.name,
  //       }
  //     });
  //
  //     deferred.resolve();
  //   }, deferred.reject));
  //
  // return deferred.promise;
};
ExportFile.prototype.onError = function (e) {
  ExportedFiles.update(this.job.args.exported_file_id, {
    $set: {
      status: "error",
      error_description: "Error running job: " + e.toString(),
    }
  });
};

// // TODO: print if we're actually going to create one
// console.log("creating index for gene_label in copy_number...");
// CopyNumber.rawCollection().ensureIndex({
//   gene_label: 1
// }, function (error, result) {
//   console.log("created index for gene_label in copy_number");
// });

JobClasses.ExportFile = ExportFile;
