export type Env = {
	Variables: {
		user: {
			id: string;
			name: string;
			email: string;
			role?: string;
			[key: string]: any;
		};
	};
};

