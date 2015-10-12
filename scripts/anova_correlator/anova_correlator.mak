#: chrisw OCT 2015
#: Compute ANOVA stats for use with Medbook-Workbench's correlator collection.
#: Requires MONGO_DB to have clinical_events, expression2, and cohort_signatures collections.
#: to use:
#:  1.  <make correlator_clin_v_other.mongoimport_part>
#:  2.  Append the resulting file to the PEARSON section of the correlator mongoimport file.
#:  3.  mongoimport the completed correlator mongoimport file.

MONGO_HOST = localhost
MONGO_PORT = 27017
MONGO_DB = MedBook

CLINICAL_STUDY=prad_wcdt

TARGETS = signature_scores.mongoimport correlator_clin_v_other.mongoimport_part clin_v_sign.mongoimport_part clin_v_expr.mongoimport_part

test:

%.mongoexport:
	mongoexport \
		--host $(MONGO_HOST):$(MONGO_PORT) \
		--db $(MONGO_DB) \
		--collection $* \
		> 1.tmp ;
	\
	mv 1.tmp $@ ;
	\
	rm -f 1.tmp ;
	\

load_signature_scores: signature_scores.mongoimport
	mongoimport \
		--host $(MONGO_HOST):$(MONGO_PORT) \
		--db $(MONGO_DB) \
		--collection signature_scores \
		< $< ;
	\

signature_scores.mongoimport: cohort_signatures.mongoexport
	python cohort_sig_2_sig_scores.py \
		-v \
		< $< \
		> 1.tmp ;
	\
	mv 1.tmp $@ ;
	\
	rm -f 1.tmp ;
	\

correlator_clin_v_other.mongoimport_part: clin_v_expr.mongoimport_part clin_v_sign.mongoimport_part
	cat $^ \
	> 1.tmp ;
	\
	mv 1.tmp $@ ;
	\
	rm -f 1.tmp ;
	\

#: ANOVA of clinical and signature
clin_v_sign.mongoimport_part: clinical_events.mongoexport signature_scores.mongoexport
	python anova.py -v \
		--clinical_study $(CLINICAL_STUDY) \
		--signature_study $(CLINICAL_STUDY) \
		--clinical clinical_events.mongoexport \
		--signature signature_scores.mongoexport \
	> 1.tmp ;
	\
	mv 1.tmp $@ ;
	\
	rm -f 1.tmp ;
	\

#: ANOVA of clinical and expression
clin_v_expr.mongoimport_part: clinical_events.mongoexport expression2.mongoexport
	python anova.py -v \
		--clinical_study $(CLINICAL_STUDY) \
		--expression_study $(CLINICAL_STUDY) \
		--clinical clinical_events.mongoexport \
		--expression expression2.mongoexport \
	> 1.tmp ;
	\
	mv 1.tmp $@ ;
	\
	rm -f 1.tmp ;
	\

clean_all: clean_mongoexports clean_targets

clean_mongoexports:
	rm -f $(wildcard *.mongoexport)

clean_targets:
	rm -f $(TARGETS)
