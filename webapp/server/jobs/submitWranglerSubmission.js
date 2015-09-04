function getCollectionByName (collectionName) {
  switch (collectionName) {
    case "network_elements":
      return NetworkElements;
    case "network_interactions":
      return NetworkInteractions;
    case "mutations":
      return Mutations;
    case "gene_expression":
      return GeneExpression;
    case "superpathways":
      return Superpathways;
    default:
      console.log("couldn't find appropriate schema");
      return null;
  }
}

function getSchemaFromName (collectionName) {
  var collection = getCollectionByName(collectionName);
  if (collection)
    return collection.simpleSchema();
  return null;
}

jobMethods.submitWranglerSubmission = function (args) {
  var submissionId = args.submission_id;
  console.log("submissionId:", submissionId);

  var noErrors = true;
  WranglerDocuments.find({"submission_id": submissionId})
      .forEach(function (object) {
        if (noErrors) { // only if there are no errors so far
          var context = getSchemaFromName(object.collection_name)
              .newContext();
          if (context.validate(object.prospective_document)) {
            // console.log("we all good");
          } else {
            console.log("invalid document found!", context.invalidKeys());
            noErrors = false;
          }
        }
      });

  function setSubmissionStatus(newStatus) {
    console.log("new submission status:", newStatus);
    WranglerSubmissions.update(submissionId, {$set: {"status": newStatus}});
  }

  if (noErrors !== true) {
    setSubmissionStatus("editing");
    // TODO: should we email them or something?
    return "submission invalid: objects did not pass schema validation";
  }

  setSubmissionStatus("writing");

  // var updateGeneExpression = true;
  // if (WranglerDocuments.findOne({
  //       "submission_id": submissionId,
  //       "collection_name": "gene_expression",
  //     })) {
  //   // TODO: update GeneExpressionSummary
  // }

  // TODO: https://docs.mongodb.org/v3.0/tutorial/perform-two-phase-commits/
  WranglerDocuments.find({"submission_id": submissionId})
      .forEach(function (object) {
        getCollectionByName(object.collection_name)
            .insert(object.prospective_document);
        WranglerDocuments.remove(object._id);
      });

  setSubmissionStatus("done");
};
