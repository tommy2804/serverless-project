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