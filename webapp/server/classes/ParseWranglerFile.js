function ParseWranglerFile (job_id) {
  WranglerFileJob.call(this, job_id);
}
ParseWranglerFile.prototype = Object.create(WranglerFileJob.prototype);
ParseWranglerFile.prototype.constructor = ParseWranglerFile;
function setBlobTextSample () {
  var deferred = Q.defer();

  var self = this;
  var blob_text_sample = "";
  var lineNumber = 0;
  var characters = 250;
  var maxLines = 5;

  var bylineStream = byLine(this.blob.createReadStream("blobs"));
  bylineStream.on('data', Meteor.bindEnvironment(function (lineObject) {
    lineNumber++;
    if (lineNumber <= maxLines) {
      blob_text_sample += lineObject.toString().slice(0, characters) + "\n";

      if (lineNumber === maxLines) {
        WranglerFiles.update(self.wranglerFile._id, {
          $set: {
            blob_text_sample: blob_text_sample
          }
        });
      }
    }
  }, deferred.reject));
  bylineStream.on('end', Meteor.bindEnvironment(function () {
    var setObject = {
      blob_line_count: lineNumber
    };

    // in case blob_text_sample not set yet
    if (lineNumber < maxLines) {
      setObject.blob_text_sample = blob_text_sample;
    }

    WranglerFiles.update(self.wranglerFile._id, {
      $set: setObject
    });

    deferred.resolve();
  }, deferred.reject));

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
  var textSamplePromise;
  if (!this.wranglerFile.blob_text_sample) {
    console.log("about to call setBlobTextSample");
    textSamplePromise = setBlobTextSample.call(this);
  }

  var deferred = Q.defer();

  Q.when(textSamplePromise)
    .then(Meteor.bindEnvironment(function () {
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
          setFileOptions({ normalization: "quantile_counts" });
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
      WranglerFiles.update(self.wranglerFile._id, {
        $set: { parsed_options_once_already: true }
      });

      // make sure we've got a file_type
      if (!options.file_type) {
        throw "File type could not be inferred. Please manually select a file type";
      }

      var fileHandlerClass = WranglerFileTypes[options.file_type];
      if (!fileHandlerClass) {
        throw new Error("file handler not yet defined (" + options.file_type +
            ")");
      }

      // figure out which FileHandler to create
      var fileHandler = new fileHandlerClass(self.wranglerFile._id);

      fileHandler.parse()
        .then(deferred.resolve)
        .catch(deferred.reject);
    }, deferred.reject))
    .catch(deferred.reject);

  return deferred.promise;
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

JobClasses.ParseWranglerFile = ParseWranglerFile;
