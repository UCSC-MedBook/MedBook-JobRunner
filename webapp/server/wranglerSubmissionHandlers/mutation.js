wranglerSubmissionHandlers.mutation = {
  validate: function (submission_id) {
    var errorArray = [];

    // add missing information to all documents
    var options = WranglerSubmissions.findOne(submission_id).options;
    WranglerDocuments.update({
            submission_id: submission_id,
            collection_name: "mutations",
          }, {
            $set: {
              "contents.study_label": options.study_label,
              "contents.collaboration_label": options.collaboration_label,
              "contents.biological_source": options.biological_source,
              "contents.mutation_impact_assessor":
                  options.mutation_impact_assessor,
            }
          }, { multi: true });

    var context = Mutations.simpleSchema().newContext();
    WranglerDocuments.find({
          submission_id: submission_id,
          // in case we add documents to describe pan-document information
          collection_name: "mutations",
        })
        .forEach(function (doc) {
          if (!context.validate(doc.contents)) {
            errorArray.push(_.reduce(context.invalidKeys(),
                function (memo, current) {
                  console.log("current:", current);
                  return memo +
                      "[" + current.name + " is " + current.type + "]";
                },
                "Invalid document: "));
          }
        });

    return errorArray;
  },
  writeToDatabase: function (submission_id) {
    var emitter = new EventEmitter();


    var cursor = WranglerDocuments.find({
      submission_id: submission_id,
      collection_name: "mutations",
    });
    
    var toInsert = cursor.count();
    var inserted = 0;

    cursor.forEach(function (wranglerDoc) {
      Mutations.insert(wranglerDoc.contents, function (error) {
        if (error) {
          console.log("ERROR: there was a problem in the writeToDatabase!!");
          console.log("error:", error);
        }
        inserted++;
        if (inserted === toInsert) {
          emitter.emit("end");
        }
      });
    });
    return emitter;
  },
};
