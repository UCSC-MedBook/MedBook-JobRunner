// actually parses wrangler files into WranglerDocuments
jobMethods.parseWranglerFile = {
  argumentSchema: new SimpleSchema({
    "wrangler_file_id": { type: Meteor.ObjectID },
  }),
  runJob: function (args) {
    var wranglerFile = WranglerFiles.findOne(args.wrangler_file_id);
    var blobObject = Blobs.findOne(wranglerFile.blob_id);

    var options = wranglerFile.options;
    if (options === undefined) {
      options = {};
    }

    function setStatusError(error_description) {
      WranglerFiles.update(wranglerFile._id, {
        $set: {
          status: "error",
          error_description: error_description,
        }
      });
    }

    if (!options || !options.file_type) {
      return setStatusError("Error: file type not set");
    }

    // make sure options.file_type is not "error"
    if (options.file_type === "error") {
      // couldn't figure it out in guessWranglerFileType job
      return;
    }

    // figure out the right method for parsing
    var fileHandler = wranglerFileHandlers[options.file_type];
    if (fileHandler && fileHandler.parser) {
      var emitter = new EventEmitter();
      var noErrors = true;
      var ended = false;

      fileHandler.parser(blobObject, options)
        .on("document-insert", Meteor.bindEnvironment(
            function (metadataAndContents) {
          if (!ended && noErrors) {
            try {
              // make sure it's good enough to add
              check(metadataAndContents, WranglerDocuments.simpleSchema().pick([
                "submission_type",
                "document_type",
                "collection_name",
                "contents",
              ]));

              // actually add it
              WranglerDocuments.insert(_.extend(metadataAndContents, {
                submission_id: blobObject.metadata.submission_id,
                user_id: blobObject.metadata.user_id,
                wrangler_file_id: wranglerFile._id,
              }));
            } catch (e) {
              // check of schema failed
              noErrors = false;
              setStatusError("Error: parser tried to add an invalid " +
                  "wrangler document");
              console.log("e:", e);
              emitter.emit("end");
            }
          } else {
            console.log("parser tried to insert after ending or error, " +
                "ignoring...", metadataAndContents);
          }
        }))
        .on("error", function (description) {
          if (!ended && noErrors) {
            noErrors = false;
            setStatusError(description);

            // remove all added documents
            WranglerDocuments.remove({
              wrangler_file_id: wranglerFile._id
            });

            emitter.emit("end");
          } else {
            console.log("parser returned more than one error or returned " +
                "an error after ending, ignoring... " + description);
          }
        })
        .once("end", function () {
          if (noErrors) {
            ended = true;
            WranglerFiles.update(wranglerFile._id, {
              $set: {
                status: "done"
              }
            });
            emitter.emit("end");
          } else {
            console.log("parser ended after returning an error... ignoring");
          }
        });

      return emitter;
    } else {
      var message = "Internal error: file handler or parsing function " +
          "not defined";
      setStatusError(message);
      return {
        error: message
      };
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
