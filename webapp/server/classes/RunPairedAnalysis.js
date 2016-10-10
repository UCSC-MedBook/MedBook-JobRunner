function RunPairedAnalysis (job_id) {
  Job.call(this, job_id);
}
RunPairedAnalysis.prototype = Object.create(Job.prototype);
RunPairedAnalysis.prototype.constructor = RunPairedAnalysis;

RunPairedAnalysis.prototype.run = function () {
  var deferred = Q.defer();
  var self = this;

  // Create the gene set first that we know the geneSetId for the records.

  var dataSet = DataSets.findOne(this.job.args.data_set_id);

  function unqualifyAndJoin(sampleLabels) {
    return MedBook.utility.unqualifySampleLabels(sampleLabels).join(", ");
  }

  // store this in a variable so we can use it to validate records
  var geneSetFields = [
    { name: "Genes", value_type: "String" },
    { name: "Differential score", value_type: "Number" },
  ];

  GeneSets.rawCollection().insert({
    // XXX: change mongo's _id creation function to use simple strings
    _id: Random.id(),

    name: "Paired analysis: " +
        unqualifyAndJoin(self.job.args.primary_sample_labels) + " vs. " +
        unqualifyAndJoin(self.job.args.progression_sample_labels),
    description: "Paired analysis in " + self.job.args.data_set_name + ": " +
        unqualifyAndJoin(self.job.args.primary_sample_labels) + " vs. " +
        unqualifyAndJoin(self.job.args.progression_sample_labels),

    // set collaborations to [] so no one can see it before it's ready
    collaborations: [],

    fields: geneSetFields,

    gene_labels: dataSet.feature_labels,
    gene_label_field: "Genes",
  }, Meteor.bindEnvironment(function (error, result) {
    if (error) {
      deferred.reject(error);
      return;
    }

    var geneSetId = result[0]._id;

    // initialize the bulk insert for the records
    var bulk = Records.rawCollection().initializeUnorderedBulkOp();

    // loop through each gene and perform the calculation
    function averageSamples(genomicData, sampleLabels) {
      var sum = _.chain(sampleLabels)
        // convert sample labels to corresponding values
        .map(function (sampleLabel) {
          return genomicData.values[dataSet.sample_label_index[sampleLabel]];
        })
        // sum the values
        .reduce(function (memo, num) {
          return memo + num;
        }, 0)
        .value();

      // divide by the number of samples
      return sum / sampleLabels.length;
    }

    expressionCursor = GenomicExpression.find({ data_set_id: dataSet._id });

    console.log("calculating...");
    expressionCursor.forEach(function (genomicData) {
      var primaryAverage = averageSamples(genomicData,
          self.job.args.primary_sample_labels);
      var progressionAverage = averageSamples(genomicData,
          self.job.args.progression_sample_labels);

      var record = {
        "Genes": genomicData.feature_label,
        "Differential score": progressionAverage - primaryAverage,
        associated_object: {
          collection_name: "GeneSets",
          mongo_id: geneSetId,
        },
      };
      MedBook.validateRecord(record, geneSetFields);

      bulk.insert(record);
    });

    // insert all of the records and then update the gene set

    bulk.execute(Meteor.bindEnvironment(function (error, result) {
      if (error) {
        deferred.reject(error);
      } else {
        // update the gene set so that people can see it
        GeneSets.update(geneSetId, {
          $set: {
            // link it to the job so it's viewable
            associated_object: {
              collection_name: "Jobs",
              mongo_id: self.job._id,
            },
          }
        });

        deferred.resolve({});
      }
    }, deferred.reject));
  }, deferred.reject));

  return deferred.promise;
};

JobClasses.RunPairedAnalysis = RunPairedAnalysis;
