wranglerSubmissionHandlers.gene_expression = {
  validate: function (submission_id) {
    // validates when the files come in
    return [];
  },
  writeToDatabase: function (submission_id) {
    var submissionOptions = WranglerSubmissions.findOne(submission_id).options;

    var filePromises = [];

    return new Bluebird(Meteor.bindEnvironment(function (resolve) {
      WranglerFiles.find({ submission_id: submission_id })
          .forEach(function (wranglerFile) {
        var deferred = Bluebird.defer();
        filePromises.push(deferred.promise);
        var fileObject = Blobs.findOne(wranglerFile.blob_id);
        var options = _.extend(wranglerFile.options, submissionOptions);

        console.log("combined options:", options);

        var fileHandler = wranglerFileHandlers[options.file_type];
        if (fileHandler.write) {
          fileHandler.write(fileObject, options)
            .then(function () {
              deferred.resolve();
            });
        } else {
          console.log("no write function for " + fileObject.original.name +
              ", ignoring...");
        }
      });

      Bluebird.settle(filePromises).then(function (results) {
        // TODO: parse results and check if something failed
        resolve();
      });
    }));
  },
};
