.PHONY: dev lint complex coverage pre-commit yapf sort deploy destroy deps unit infra-tests integration e2e pipeline-tests docs lint-docs build

build:
	npm run build
	
deploy:
	make build
	cdk deploy --require-approval=never --profile tommy-dev

deploy-dev:
	make build
	cdk deploy --require-approval=never --profile tommy-dev

fast-deploy:
	make build
	cdk deploy --hotswap --require-approval=never --profile tommy-dev

destroy:
	cdk destroy --force --profile tommy-dev