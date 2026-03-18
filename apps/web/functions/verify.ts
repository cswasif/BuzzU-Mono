interface PagesFunction {
    (context: { request: Request; env: any; next: () => Promise<Response>; params: any; data: any }): Promise<Response>;
}

export const onRequestPost: PagesFunction = async (context: any) => {
    const formData = await context.request.formData();
    const credential = formData.get('credential');

    if (credential) {
        const url = new URL(context.request.url);
        url.hash = `token=${encodeURIComponent(String(credential))}`;

        return Response.redirect(url.toString(), 303);
    }

    return Response.redirect(new URL('/verify', context.request.url).toString(), 302);
};

export const onRequestGet: PagesFunction = async (context: any) => {
    return context.next();
};
