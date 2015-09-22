// actually parses wrangler files into WranglerDocuments
// NOTE: to be run *after* differentiateWranglerFile (checks done there)
jobMethods.parseWranglerFile = function (args, jobDone) {
  var wranglerFile = WranglerFiles.findOne(args.wrangler_file_id);
  var blobObject = Blobs.findOne(wranglerFile.blob_id);

  _.extend(args, {
    setFileStatus: Meteor.bindEnvironment(
        function (statusString, errorDescription) {
      WranglerFiles.update(wranglerFile._id, {
        $set: {
          "status": statusString,
          "error_description": errorDescription,
        }
      });
    }),
    documentInsert: function (collectionName, prospectiveDocument) {
      WranglerDocuments.insert(
        {
          "submission_id": blobObject.metadata.submission_id,
          "user_id": blobObject.metadata.user_id,
          "collection_name": collectionName,
          "prospective_document": prospectiveDocument,
          "wrangler_file_id": wranglerFile._id,
        },
        function (error, result) {
          if (error) {
            console.log("something went wrong adding to the database...");
            console.log(error);
            args.onError("something went wrong adding to the database");
          }
        }
      );
    },
  });
  // has to be after because code runs immidiately
  args.onError = _.partial(args.setFileStatus, "error");

  parsingFunctions[args.parsing_name](blobObject, args, jobDone);
};
