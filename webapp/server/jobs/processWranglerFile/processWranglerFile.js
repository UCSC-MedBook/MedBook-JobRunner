jobMethods.processWranglerFile = function (args, jobDone) {
  var fileObject = Blobs.findOne(args.file_id);
  var fileName = fileObject.original.name;

    var helpers = {};
    helpers = {
      setFileStatus: Meteor.bindEnvironment(
          function (statusString, errorDescription) {
        var modifier = { $set: { "files.$.status": statusString } };

        if (errorDescription !== undefined) {
          modifier.$set["files.$.error_description"] = errorDescription;
        }

        WranglerSubmissions.update({
          "_id": fileObject.metadata.submission_id,
          "files.file_id": fileObject._id,
        }, modifier);
      }),
      documentInsert: function (collectionName, prospectiveDocument) {
        WranglerDocuments.insert(
          {
            "submission_id": fileObject.metadata.submission_id,
            "file_id": fileObject._id,
            "collection_name": collectionName,
            "prospective_document": prospectiveDocument,
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
      addReviewType: Meteor.bindEnvironment(function (typeName) {
        WranglerSubmissions.update({
          "_id": fileObject.metadata.submission_id,
        }, {
          $addToSet: { "document_types": typeName }
        });
      }),
    };
    // has to be after because code runs immidiately
    helpers.onError = _.partial(helpers.setFileStatus, "error");

    function extensionEquals(extension) {
      return fileName.slice(-extension.length) === extension;
    }

    var processingName;

    if (extensionEquals(".sif")) {
      processingName = "parseNetworkInteractions";
    } else if (extensionEquals(".tab") &&
        fileName.indexOf("definitions") > -1) {
      processingName = "parseNetworkElements";
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
