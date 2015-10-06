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
        WranglerFiles.update(wranglerFile._id, {
          $set: {
            status: statusString,
            error_description: errorDescription,
          }
        });
      }),
      documentInsert:
          function (submission_type, document_type, contents) {
        if (contents === undefined) {
          console.log("contents undefined");
        }

        WranglerDocuments.insert(
          {
            submission_id: blobObject.metadata.submission_id,
            user_id: blobObject.metadata.user_id,
            submission_type: submission_type,
            document_type: document_type,
            contents: contents,
            wrangler_file_id: wranglerFile._id,
          },
          function (error, result) {
            if (error) {
              console.log("something went wrong adding to the database...");
              console.log(error);
              helpers.onError("something went wrong adding to the database");
            }
          }
        );
      },
    });
    // has to be after because code runs immidiately
    helpers.onError = _.partial(helpers.setFileStatus, "error");

    // make sure options.file_type is defined
    if (!options || !options.file_type) {
      helpers.onError("Error: file type not defined");
      jobDone();
      return;
    }

    // make sure options.file_type is not "error"
    if (options.file_type === "error") {
      jobDone();
      return;
    }

    // figure out the right method for parsing
    var parsingName = "parse" + options.file_type;
    console.log("parsingName:", parsingName);
    if (parsingName && parsingFunctions[parsingName]) {
      parsingFunctions[parsingName](blobObject, helpers, jobDone);
    } else {
      helpers.onError("Internal error: parsing name or function not defined");
      jobDone();
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
