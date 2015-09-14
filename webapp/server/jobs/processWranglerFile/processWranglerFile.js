jobMethods.processWranglerFile = function (args, jobDone) {
  var fileObject = Blobs.findOne(args.file_id);
  var fileName = fileObject.original.name;

  // if they didn't make one yet, that's on them
  var wranglerFile = WranglerFiles.findOne({
    "file_id": fileObject._id,
  });
  if (!wranglerFile) {
    jobDone();
    return;
  }

  var helpers = {};
  helpers = {
    setFileStatus: Meteor.bindEnvironment(
        function (statusString, errorDescription) {
      WranglerFiles.update({
        "file_id": fileObject._id,
      }, {
        $set: {
          "status": statusString,
          "error_description": errorDescription,
        }
      });
    }),
    documentInsert: function (collectionName, prospectiveDocument) {
      WranglerDocuments.insert(
        {
          "submission_id": fileObject.metadata.submission_id,
          "collection_name": collectionName,
          "prospective_document": prospectiveDocument,
          "wrangler_file_id": wranglerFile._id,
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
  };
  // has to be after because code runs immidiately
  helpers.onError = _.partial(helpers.setFileStatus, "error");

  function extensionEquals(extension) {
    return fileName.slice(-extension.length) === extension;
  }

  var processingName;

  // TODO: pull from manual_file_type if possible

  if (extensionEquals(".sif")) {
    processingName = "parseSuperpathwayInteractions";
  } else if (extensionEquals(".tab") &&
      fileName.indexOf("definitions") > -1) {
    processingName = "parseSuperpathwayElements";
  } else if (extensionEquals(".vcf")) {
    processingName = "parseMutationVCF";
  } else if (extensionEquals(".tar.gz")) {
    processingName = "uncompressTarGz";
  } else if (extensionEquals(".rsem.genes.raw_counts.tab")) {
    processingName = "parseGeneExpression";
  } else if (extensionEquals(".rsem.genes.norm_counts.tab")) {
    processingName = "parseGeneExpression";
  } else if (extensionEquals(".rsem.genes.norm_tpm.tab")) {
    processingName = "parseGeneExpression";
  } else if (extensionEquals(".rsem.genes.norm_fpkm.tab")) {
    processingName = "parseGeneExpression";
  } else {
    helpers.onError("unknown file type");
  }

  if (processingName) {
    wranglerProcessing[processingName](fileObject, helpers, jobDone);
  } else {
    jobDone();
  }

  // TODO: if from a compressed file, delete the file on the disk
};
