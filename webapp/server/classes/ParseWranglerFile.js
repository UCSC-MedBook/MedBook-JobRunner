function ParseWranglerFile (job_id) {
  WranglerFileJob.call(this, job_id);
}
ParseWranglerFile.prototype = Object.create(WranglerFileJob.prototype);
ParseWranglerFile.prototype.constructor = ParseWranglerFile;

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

  // get a sample of the text inside the blob, as well as the number of lines
  // of blob
  var textSample = {}; // so that textSample.promise will be undefined
  if (!self.wranglerFile.blob_text_sample) {
    textSample = Q.defer();
    getBlobTextSample(self.blob)
      .then(Meteor.bindEnvironment(function (setObject) {
        WranglerFiles.update(self.wranglerFile._id, {
          $set: setObject
        });
        textSample.resolve("hello");
      }, textSample.reject));
  }

  var deferred = Q.defer();
  Q.when(textSample.promise)
    .then(Meteor.bindEnvironment(function (first) {
      // try to guess options that have not been manually specified
      var options = self.wranglerFile.options;
      if (options === undefined) {
        options = {};
      }
      function setFileOptions(newOptions) {
        _.extend(options, newOptions); // keeps `options` up to date
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
        if (blobName.match(/\.rsem\.genes\.[a-z_]*\.(hugo\.|)tab/g)) {
          // http://regexr.com/3d9i7
          setFileOptions({ file_type: "RectGenomicExpression" });
        } else if (blobName.match(/\.gmt$/g)) {
          setFileOptions({ file_type: "GeneSetGroup" });
        }
      }

      // // try to guess normalization
      // if (!options.normalization) {
      //   // try to guess normalization
      //   if (blobName.match(/raw_counts/g)) {
      //     setFileOptions({ normalization: "raw_counts" });
      //   } else if (blobName.match(/norm_counts/g)) {
      //     setFileOptions({ normalization: "quantile_counts" });
      //   } else if (blobName.match(/norm_tpm/g)) {
      //     setFileOptions({ normalization: "tpm" });
      //   } else if (blobName.match(/norm_fpkm/g)) {
      //     setFileOptions({ normalization: "fpkm" });
      //   }
      // }

      if (self.blob.metadata && self.blob.metadata.wrangler_file_options) {
        setFileOptions(self.blob.metadata.wrangler_file_options);
      }

      // we can now show the options to the user
      WranglerFiles.update(self.wranglerFile._id, {
        $set: { parsed_options_once_already: true }
      });

      // make sure we've got a file_type
      if (!options.file_type) {
        throw "File type could not be inferred. " +
            "Please manually select a file type";
      }

      var fileHandlerClass = WranglerFileHandlers[options.file_type];
      if (!fileHandlerClass) {
        throw new Error("file handler not yet defined (" + options.file_type +
            ")");
      }

      // figure out which FileHandler to create
      var fileHandler = new fileHandlerClass(self.wranglerFile._id);

      // make sure the options match the schema
      var optionsSchema = Wrangler.fileTypes[options.file_type].schema;
      if (!optionsSchema.newContext().validate(_.omit(options, "file_type"))) {
        throw "Invalid options";
      }

      fileHandler.parse()
        .then(Meteor.bindEnvironment(function () {
          WranglerFiles.update(self.wranglerFile._id, {
            $set: {
              status: "done",
            }
          });

          deferred.resolve();
        }, deferred.reject))
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

JobClasses.ParseWranglerFile = ParseWranglerFile;
