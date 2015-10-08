// actually parses wrangler files into WranglerDocuments
jobMethods.parseWranglerFile = {
  argumentSchema: new SimpleSchema({
    "wrangler_file_id": { type: Meteor.ObjectID },
  }),
  onRun: function (args, jobDone) {
    var wranglerFile = WranglerFiles.findOne(args.wrangler_file_id);
    var blobObject = Blobs.findOne(wranglerFile.blob_id);

    var options = wranglerFile.options;
    if (options === undefined) {
      options = {};
    }

    var helpers = _.extend(options, {
      setFileStatus: Meteor.bindEnvironment(
          function (statusString, errorDescription) {
        console.log("statusString, errorDescription:", statusString, errorDescription);
        WranglerFiles.update(wranglerFile._id, {
          $set: {
            status: statusString,
            error_description: errorDescription,
          }
        });
      }),
      documentInsert: function (args) { // TODO: ecmascript2015 :'(
        WranglerDocuments.insert(_.extend(args,
          {
            submission_id: blobObject.metadata.submission_id,
            user_id: blobObject.metadata.user_id,
            wrangler_file_id: wranglerFile._id,
          }),
          function (error, result) {
            if (error) {
              var message = "Something went wrong adding to the database" +
                  error;
              console.log(message);
              helpers.onError(message);
            }
          }
        );
      },
      hadErrors: function () {
        var upToDate = WranglerFiles.findOne(wranglerFile._id);
        return upToDate.error_description ||
            upToDate.status === "error";
      },
      doneParsing: function () {
        // doesn't necessarily set file status to "done"
        if (!helpers.hadErrors()) {
          helpers.setFileStatus("done");
        }
        return jobDone();
      }
    });
    // has to be after because _.partial runs immidiately
    helpers.onError = _.partial(helpers.setFileStatus, "error");

    // make sure options.file_type is defined
    if (!options || !options.file_type) {
      helpers.onError("Error: file type not defined");
      return jobDone();
    }

    // make sure options.file_type is not "error"
    if (options.file_type === "error") {
      return jobDone();
    }

    // figure out the right method for parsing
    var fileHandler = wranglerFileHandlers[options.file_type];
    if (fileHandler && fileHandler.parse) {
      return fileHandler.parse(helpers, blobObject);
    } else {
      helpers.onError("Internal error: file handler or parsing function " +
          "not defined");
      return jobDone();
    }
  },
  onError: function (args, errorDescription) {
    WranglerFiles.update(args.wrangler_file_id, {
      $set: {
        "status": "error",
        "error_description": "Exception running job: " + errorDescription,
      }
    });
  },
};
